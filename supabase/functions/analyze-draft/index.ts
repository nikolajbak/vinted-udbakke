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

async function callClaude(system: string, userContent: unknown[], model: string, maxTokens = 900): Promise<string> {
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
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  return text;
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no_json_in_response");
  return JSON.parse(match[0]);
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let id: string, imageUrl: string;
  try {
    const body = await req.json();
    id = body.id;
    imageUrl = body.image_url;
    if (!id || !imageUrl) throw new Error("missing id or image_url");
  } catch (e) {
    return new Response(`bad_request: ${e}`, { status: 400 });
  }

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`image_fetch_${imgRes.status}`);
    const imgBuf = await imgRes.arrayBuffer();
    const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
    const mediaType = imgRes.headers.get("content-type") || "image/jpeg";

    // 1. Vision: identify the product from the photo, as an expert seller would size it up.
    const visionText = await callClaude(
      SELLER_PERSONA + " Du kigger på et foto af en vare, kunden vil sælge, og vurderer den, som du ville gøre " +
        "før du selv lagde den til salg. Svar KUN med et JSON-objekt, ingen forklaring udenom: " +
        '{"productType": "...", "brand": "... eller null", "color": "...", "material": "... eller null", ' +
        '"size": "... eller null", "condition": "ny med maerke/ny uden maerke/god/brugt/slidt", ' +
        '"visibleFlaws": "kort, eller \\"ingen synlige\\"", "category": "...", ' +
        '"searchQuery": "korte soegeord (paa dansk) til at finde lignende varer på Vinted"}',
      [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imgB64 } },
        { type: "text", text: "Analysér billedet og svar med JSON som beskrevet." },
      ],
      VISION_MODEL,
    );
    const vision = extractJson(visionText);
    const searchQuery = String(vision.searchQuery || vision.productType || "genbrug");

    // 2. Ground pricing in real, currently active Vinted listings (dk first, fr as fallback).
    const { items, country, blocked } = await searchWithFallback(searchQuery, "dk", "fr", 12);
    const comparables = items.slice(0, 10).map((it) => `${it.title} — ${it.price} ${it.currency}`).join("\n");

    // 3. Write the final ad: title, description, price AND a short sell-through strategy,
    // grounded in whatever comparables we found. Same expert-seller persona, bigger model —
    // this step is the one the seller actually has to trust.
    const marketContext = blocked || items.length === 0
      ? `Vinted-søgningen for "${searchQuery}" i ${country} gav intet brugbart resultat (${blocked ? "sandsynligvis blokeret" : "ingen fund"}). ` +
        "Sæt prisen efter dit eget erfarne skøn for denne varetype i Danmark, og sig det tydeligt og ærligt i priceNote — påstå ikke at den er markedstjekket."
      : `${items.length} sammenlignelige, AKTIVE annoncer fundet på Vinted (${country}):\n${comparables}\n\n` +
        "Brug disse til at lægge en reel salgsstrategi: hvor ligger prisen i forhold til feltet, og hvorfor (fx lidt under median for hurtigt salg, " +
        "eller i toppen hvis stand/mærke berettiger det)? Nævn det kort i priceNote.";

    const draftText = await callClaude(
      SELLER_PERSONA + " Skriv et komplet annonce-udkast PÅ DANSK til Vinted for varen, ud fra produktanalysen og markedsdata nedenfor. " +
        "Titel: mærke/type/størrelse først, det er det folk søger på — ikke sælger-sprog. " +
        "Beskrivelse: ærlig og konkret (mærke, størrelse, materiale, stand, evt. mangler fra visibleFlaws), gerne 3-6 linjer, " +
        "og slut med noget der reelt fremmer salget på det danske marked (fx hurtig afsendelse, bytter ved køb af flere, kan sende måltagning ved forespørgsel — " +
        "vælg kun det der er relevant, opfind ikke konkrete tal du ikke har). " +
        "Pris: et konkret beløb i kr, sat som en reel salgsstrategi (se markedsdata), ikke bare et gennemsnit. " +
        "Svar KUN med et JSON-objekt, ingen forklaring udenom: " +
        '{"title": "...", "description": "...", "category": "...", "condition": "...", "price": "fx 89 kr", "priceNote": "kort strategi-begrundelse, 1-2 saetninger"}',
      [
        {
          type: "text",
          text: `Produktanalyse fra billedet: ${JSON.stringify(vision)}\n\n${marketContext}`,
        },
      ],
      STRATEGY_MODEL,
    );
    const draft = extractJson(draftText);

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
