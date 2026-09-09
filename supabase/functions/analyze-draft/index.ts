// Triggered by a Postgres webhook (see schema.sql / update_webhook.sql)
// whenever a new "afventer" draft is inserted. Analyzes the photo with
// Claude, grounds a price estimate in real Vinted listings, and writes
// the finished draft back to the row.

import { createClient } from "npm:@supabase/supabase-js@2";
import { searchWithFallback } from "./vinted.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const VISION_MODEL = "claude-haiku-4-5-20251001";
const STRATEGY_MODEL = "claude-sonnet-5";

const SELLER_PERSONA =
  "Du er en meget erfaren sælger på Vinted med speciale i det danske marked. " +
  "Du kender de normer, der faktisk sælger på Vinted.dk: konkurrencedygtige (ikke ambitiøse) priser, " +
  "tillidsvækkende og præcise beskrivelser, ærlig angivelse af slid/mangler (det booster tillid og reducerer retursager), " +
  "og titler der rammer det, folk rent faktisk søger efter (mærke + type + evt. størrelse/farve foran, ikke reklamesprog).";

// Forced tool use instead of "please answer in JSON": the model returns a
// structured object, so a chatty preamble can't break parsing.
async function callClaudeJson(
  system: string,
  userContent: unknown[],
  model: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  maxTokens = 1200,
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const block = (data?.content || []).find((b: { type?: string }) => b?.type === "tool_use");
  if (!block?.input) throw new Error("no_tool_use_in_response");
  return block.input as Record<string, unknown>;
}

const VISION_TOOL = {
  name: "registrer_vare",
  description: "Registrér hvad varen på billederne er, til brug i en Vinted-annonce.",
  input_schema: {
    type: "object",
    properties: {
      productType: { type: "string" },
      brand: { type: ["string", "null"] },
      color: { type: "string" },
      material: { type: ["string", "null"] },
      size: { type: ["string", "null"] },
      condition: { type: "string" },
      visibleFlaws: { type: "string" },
      category: { type: "string" },
      searchQuery: { type: "string", description: "Korte danske søgeord til at finde lignende varer på Vinted" },
    },
    required: ["productType", "color", "condition", "visibleFlaws", "category", "searchQuery"],
  },
};

const DRAFT_TOOL = {
  name: "skriv_annonce",
  description: "Skriv det færdige annonce-udkast på dansk.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      condition: { type: "string" },
      price: { type: "string", description: 'Konkret beløb, fx "89 kr"' },
      priceNote: { type: "string", description: "Kort strategi-begrundelse, 1-2 sætninger" },
    },
    required: ["title", "description", "category", "condition", "price", "priceNote"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let id: string;
  try {
    const body = await req.json();
    id = body.id;
    if (!id) throw new Error("missing id");
  } catch (e) {
    return new Response(`bad_request: ${e}`, { status: 400 });
  }

  try {
    const { data: row, error: rowErr } = await supabase
      .from("drafts")
      .select("photos, image_url")
      .eq("id", id)
      .single();
    if (rowErr) throw new Error(`row_fetch_failed: ${rowErr.message}`);

    type Photo = { url: string; kind?: string };
    const photos: Photo[] = Array.isArray(row?.photos) && row.photos.length
      ? row.photos as Photo[]
      : row?.image_url
      ? [{ url: row.image_url as string, kind: "forfra" }]
      : [];
    if (!photos.length) throw new Error("no_photos");

    // Cap what we send: the first few carry almost all the signal, and each
    // image costs tokens and latency.
    const imageBlocks: unknown[] = [];
    for (const photo of photos.slice(0, 5)) {
      const imgRes = await fetch(photo.url);
      if (!imgRes.ok) continue;
      const imgBuf = await imgRes.arrayBuffer();
      const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
      const mediaType = imgRes.headers.get("content-type") || "image/jpeg";
      // Naming the shot lets the model read a blurry label photo for what it
      // is instead of guessing at a mystery close-up.
      imageBlocks.push({ type: "text", text: `Billede (${photo.kind || "ukendt vinkel"}):` });
      imageBlocks.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imgB64 },
      });
    }
    if (!imageBlocks.length) throw new Error("image_fetch_failed");

    // 1. Vision: identify the product from the photo, as an expert seller would size it up.
    const vision = await callClaudeJson(
      SELLER_PERSONA + " Du kigger på ALLE fotos af den samme vare, kunden vil sælge, og vurderer den, som du ville gøre " +
        "før du selv lagde den til salg. Mærke- og størrelsesmærkat-billederne er dine primære kilder til mærke, " +
        "størrelse og materiale — læs dem, i stedet for at gætte ud fra formen. Er noget ikke læsbart, så lad feltet " +
        "være tomt frem for at finde på det. condition skal være en af: ny med mærke, ny uden mærke, god, brugt, slidt.",
      [
        ...imageBlocks,
        { type: "text", text: "Analysér alle billederne af varen." },
      ],
      VISION_MODEL,
      VISION_TOOL,
    );
    const searchQuery = String(vision.searchQuery || vision.productType || "genbrug");

    // 2. Try to ground pricing here, but don't lean on it: Vinted blocks
    // datacenter IPs intermittently. When this fails the phone does the
    // lookup instead (same-origin from vinted.dk, never blocked) — see
    // vinted-fill-script. One quick attempt only, so a blocked call doesn't
    // hold the draft up.
    const { items, country, blocked } = await searchWithFallback(searchQuery, "dk", "fr", 12, 1);
    const comparables = items.slice(0, 10).map((it) => `${it.title} — ${it.price} ${it.currency}`).join("\n");

    // 3. Write the final ad: title, description, price AND a short sell-through strategy,
    // grounded in whatever comparables we found. Same expert-seller persona, bigger model —
    // this step is the one the seller actually has to trust.
    const grounded = !blocked && items.length > 0;
    const marketContext = !grounded
      ? `Vinted-søgningen for "${searchQuery}" i ${country} gav intet brugbart resultat (${blocked ? "sandsynligvis blokeret" : "ingen fund"}). ` +
        "Sæt en foreløbig pris efter dit eget erfarne skøn for denne varetype i Danmark. Skriv i priceNote at det er et foreløbigt skøn, " +
        "der bliver markedstjekket når annoncen udfyldes — påstå ikke at den allerede er tjekket."
      : `${items.length} sammenlignelige, AKTIVE annoncer fundet på Vinted (${country}):\n${comparables}\n\n` +
        "Brug disse til at lægge en reel salgsstrategi: hvor ligger prisen i forhold til feltet, og hvorfor (fx lidt under median for hurtigt salg, " +
        "eller i toppen hvis stand/mærke berettiger det)? Nævn det kort i priceNote.";

    const draft = await callClaudeJson(
      SELLER_PERSONA + " Skriv et komplet annonce-udkast PÅ DANSK til Vinted for varen, ud fra produktanalysen og markedsdata nedenfor. " +
        "Titel: mærke/type/størrelse først, det er det folk søger på — ikke sælger-sprog. " +
        "Beskrivelse: ærlig og konkret (mærke, størrelse, materiale, stand, evt. mangler fra visibleFlaws), gerne 3-6 linjer, " +
        "og slut med noget der reelt fremmer salget på det danske marked (fx hurtig afsendelse, bytter ved køb af flere, kan sende måltagning ved forespørgsel — " +
        "vælg kun det der er relevant, opfind ikke konkrete tal du ikke har). " +
        "Pris: et konkret beløb i kr, sat som en reel salgsstrategi (se markedsdata), ikke bare et gennemsnit.",
      [
        {
          type: "text",
          text: `Produktanalyse fra billederne: ${JSON.stringify(vision)}\n\n${marketContext}`,
        },
      ],
      STRATEGY_MODEL,
      DRAFT_TOOL,
    );

    const { error } = await supabase
      .from("drafts")
      .update({
        status: "ny",
        title: draft.title,
        description: draft.description,
        category: draft.category,
        condition: draft.condition,
        price: draft.price,
        price_note: draft.priceNote,
        search_query: searchQuery,
        price_grounded: grounded,
      })
      .eq("id", id);

    if (error) throw new Error(`db_update_failed: ${error.message}`);

    return new Response(JSON.stringify({ ok: true, blocked }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-draft failed", err);
    // Leave status as 'afventer' but note the failure so the UI/user isn't left guessing forever.
    await supabase.from("drafts").update({
      price_note: `Analyse mislykkedes: ${err instanceof Error ? err.message : String(err)}`,
    }).eq("id", id);
    return new Response(`error: ${err}`, { status: 500 });
  }
});
