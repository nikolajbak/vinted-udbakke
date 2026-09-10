// Triggered by a Postgres webhook (see schema.sql / update_webhook.sql)
// whenever a new "afventer" draft is inserted. Analyzes the photo with
// Claude, grounds a price estimate in real Vinted listings, and writes
// the finished draft back to the row.

import { createClient } from "npm:@supabase/supabase-js@2";
import { searchWithFallback } from "./vinted.ts";
import { GUIDANCE_TOOL, optimizePhoto } from "./optimize.ts";

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

// Modellens egen værktøjssyntaks er observeret lække ind i felterne
// ("… Sender hurtigt!</description><parameter name=\"category\">Børnetøj").
// Det må aldrig nå en annonce, så alt fra første tag-agtige tegn skæres væk.
function cleanText(value: unknown): string {
  let t = String(value ?? "");
  const cut = t.search(/<\/?\s*(description|parameter|title|price|invoke|function|antml)\b/i);
  if (cut > -1) t = t.slice(0, cut);
  return t.replace(/<[^>]*>/g, "").replace(/\s+$/, "").trim();
}

// Spreading a whole image's bytes into String.fromCharCode blows the call
// stack once photos get past a few hundred KB, so encode in chunks.
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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

const VERIFY_MASK_TOOL = {
  name: "tjek_maskering",
  description: "Sig om der stadig er et personnavn eller anden personlig oplysning at læse på billedet.",
  input_schema: {
    type: "object",
    properties: {
      stillVisible: {
        type: "boolean",
        description: "true hvis et personnavn, en adresse eller lignende stadig kan læses helt eller delvist",
      },
    },
    required: ["stillVisible"],
  },
};

// Vinteds egne felter. Bogmærket klikker dem igennem, så værdierne skal
// være Vinteds ordlyd — ikke en fri oversættelse.
const VINTED_TOP = [
  "Kvinder", "Mænd", "Børn", "Bolig", "Elektronik",
  "Bøger og medier", "Hobby og samlerobjekter", "Sport",
];
const VINTED_CONDITIONS = [
  "Ny med prismærker", "Ny uden prismærker", "Meget god", "God", "Tilfredsstillende",
];
const VINTED_COLORS = [
  "Sort", "Grå", "Hvid", "Flødefarvet", "Beige", "Abrikos", "Orange", "Koral", "Rød",
  "Bourgogne", "Lyserød", "Rosa", "Lilla", "Lyslilla", "Lyseblå", "Blå", "Marineblå",
  "Turkis", "Mintgrøn", "Grøn", "Mørkegrøn", "Khaki", "Brun", "Sennepsgul", "Gul",
  "Sølv", "Guld", "Flerfarvet", "Klar",
];

const DRAFT_TOOL = {
  name: "skriv_annonce",
  description: "Skriv det færdige annonce-udkast på dansk.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      categoryPath: {
        type: "array",
        items: { type: "string" },
        description:
          "Vejen ned gennem Vinteds danske kategoritræ, fra øverste niveau til det mest præcise underpunkt, " +
          `fx ["Kvinder","Tøj","Kjoler","Midikjoler"] eller ["Mænd","Tøj","Trøjer og sweatshirts","Hættetrøjer"]. ` +
          `Øverste niveau SKAL være ét af: ${VINTED_TOP.join(", ")}. ` +
          "Brug Vinteds egen danske ordlyd, og gå kun så dybt du er sikker på.",
      },
      brand: {
        type: ["string", "null"],
        description: "Mærkets navn præcis som det staves på Vinted, fx \"Ganni\". null hvis intet mærke kan læses.",
      },
      size: {
        type: ["string", "null"],
        description: 'Størrelsen som den står på etiketten, fx "M", "38", "42" eller "Én størrelse". null hvis ukendt.',
      },
      sizeScale: {
        type: ["string", "null"],
        enum: ["S/M/L", "EU", "UK", "FR", "IT", "US", null],
        description: "Hvilken målestok størrelsen er angivet i. Bogstavstørrelser er S/M/L, danske taltørrelser er EU.",
      },
      color: {
        type: ["string", "null"],
        enum: [...VINTED_COLORS, null],
        description: "Varens hovedfarve, valgt fra Vinteds egen farveliste.",
      },
      condition: {
        type: "string",
        enum: VINTED_CONDITIONS,
        description: "Standen, valgt fra Vinteds fem faste muligheder.",
      },
      price: { type: "string", description: 'Konkret beløb, fx "89 kr"' },
      priceNote: { type: "string", description: "Kort strategi-begrundelse, 1-2 sætninger" },
    },
    required: ["title", "description", "category", "categoryPath", "condition", "price", "priceNote"],
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

    type Photo = { url: string; path?: string; kind?: string; optimized?: boolean };
    const photos: Photo[] = Array.isArray(row?.photos) && row.photos.length
      ? row.photos as Photo[]
      : row?.image_url
      ? [{ url: row.image_url as string, kind: "forfra" }]
      : [];
    if (!photos.length) throw new Error("no_photos");

    // Fetch every photo once; the bytes get reused for optimisation and for
    // the model calls.
    const loaded: Array<{ photo: Photo; buf: ArrayBuffer; mediaType: string }> = [];
    for (const photo of photos) {
      const imgRes = await fetch(photo.url);
      if (!imgRes.ok) continue;
      loaded.push({
        photo,
        buf: await imgRes.arrayBuffer(),
        mediaType: imgRes.headers.get("content-type") || "image/jpeg",
      });
    }
    if (!loaded.length) throw new Error("image_fetch_failed");

    // 0. Vurdér HVERT billede for sig. Da alle seks blev vurderet i ét kald,
    // returnerede modellen upræcise kasser, og naerbilleder blev stort set
    // ikke beskaaret. Ét billede ad gangen er markant mere praecist.
    // Best-effort: originalen staar, hvis noget fejler.
    let personalInfoSeen = false;
    for (const l of loaded) {
      if (!l.photo.path) continue;
      if (l.photo.optimized || /-opt\.jpg$/i.test(l.photo.path)) continue;
      try {
        const g = await callClaudeJson(
          "Du er fotograf og forbereder ét foto til en Vinted-annonce.\n\n" +
            "1) Rotation: hvor mange grader med uret skal billedet drejes for at vende rigtigt (0/90/180/270)?\n" +
            "2) Kassen: angiv motivets yderste kanter i normaliserede koordinater 0-1. " +
            "Er billedet et NAERBILLEDE af et maerkat, en etiket, et tryk eller en detalje, skal kassen " +
            "slutte taet om selve maerkatet/detaljen — ikke om hele toejstykket omkring det. " +
            "Er billedet en HEL vare, skal kassen foelge varens kanter og holde gulv, borde, " +
            "foedder, ben, haender og moebler udenfor.\n" +
            "3) personalRegions: udpeg de omraader der viser PERSONLIGE oplysninger og skal " +
            "maskeres — paasyede navnemaerker, et barns navn, adresse eller telefonnummer. " +
            "Angiv HELE det klistermaerke eller den lap, navnet staar paa — hele dens omrids, " +
            "ikke bare bogstaverne. Er der to navnelapper, saa angiv dem hver for sig. " +
            "Kassen maa IKKE strackke sig ned over stoerrelses- eller maerkemaerkatet: " +
            "fx \"SIZE 120\" og brandnavnet skal forblive laesbare. Maskér heller aldrig " +
            "vaskemaerker eller producentens egen adresse. Er der intet personligt, " +
            "returnér en tom liste.\n" +
            "3b) protectRegions: angiv de maerkater der SKAL forblive laesbare — brandmaerkatet og " +
            "maerkatet med stoerrelse eller vaskeanvisning. Tag dem med ogsaa naar de ligger " +
            "delvist under et navnemaerke; de bliver friholdt pixel for pixel.\n" +
            "4) Billedbehandling: bedoem billedet som en fotograf og angiv de rettelser, det faktisk " +
            "har brug for. Moerkt toej fotograferet indendoers er typisk undereksponeret og skal loeftes. " +
            "Et traegulv eller gult paerelys giver et varmt farvestik, som skal koeles ned (negativ warmth), " +
            "ellers ser sort toej brunligt ud. Er billedet allerede godt, saa svar 0 - overdriv ikke.",
          [
            { type: "image", source: { type: "base64", media_type: l.mediaType, data: toBase64(l.buf) } },
            { type: "text", text: `Billedtype: ${l.photo.kind || "ukendt"}. Vurdér dette ene billede.` },
          ],
          STRATEGY_MODEL,
          GUIDANCE_TOOL,
          400,
        );

        const regions = Array.isArray(g.personalRegions) ? g.personalRegions : [];
        const guards = Array.isArray(g.protectRegions) ? g.protectRegions : [];
        if (regions.length) personalInfoSeen = true;
        const toBox = function (r: Record<string, number>) {
          return { x0: Number(r.x0), y0: Number(r.y0), x1: Number(r.x1), y1: Number(r.y1) };
        };

        let jpeg = await optimizePhoto(l.buf, {
          rotationDegrees: Number(g.rotationDegrees) || 0,
          crop: { x0: Number(g.x0), y0: Number(g.y0), x1: Number(g.x1), y1: Number(g.y1) },
          mask: regions.map(toBox),
          protect: guards.map(toBox),
          look: {
            exposure: Number(g.exposure) || 0,
            contrast: Number(g.contrast) || 0,
            warmth: Number(g.warmth) || 0,
            saturation: Number(g.saturation) || 0,
          },
        });
        // Ét forsøg rammer ikke altid hele navnet. Frem for at stole på det,
        // ser modellen på sit eget resultat og får lov at udvide masken én gang.
        if (regions.length) {
          try {
            const check = await callClaudeJson(
              "Du kontrollerer, at personlige oplysninger er maskeret godt nok, før billedet lægges " +
                "i en offentlig annonce. Kan et personnavn stadig laeses — helt eller delvist, ogsaa " +
                "kun nogle bogstaver — saa er svaret true. Maerkenavne, stoerrelser og vaskeanvisninger " +
                "er IKKE personlige og skal ikke give true.",
              [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer) } },
                { type: "text", text: "Er der stadig et navn at laese?" },
              ],
              VISION_MODEL,
              VERIFY_MASK_TOOL,
              200,
            );
            if (check.stillVisible === true) {
              const wider = regions.map(function (r: Record<string, number>) {
                const cx = (Number(r.x0) + Number(r.x1)) / 2, cy = (Number(r.y0) + Number(r.y1)) / 2;
                const hw = Math.abs(Number(r.x1) - Number(r.x0)) / 2 * 1.45;
                const hh = Math.abs(Number(r.y1) - Number(r.y0)) / 2 * 1.45;
                return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
              });
              jpeg = await optimizePhoto(l.buf, {
                rotationDegrees: Number(g.rotationDegrees) || 0,
                crop: { x0: Number(g.x0), y0: Number(g.y0), x1: Number(g.x1), y1: Number(g.y1) },
                mask: wider,
                protect: guards.map(toBox),
                look: {
                  exposure: Number(g.exposure) || 0,
                  contrast: Number(g.contrast) || 0,
                  warmth: Number(g.warmth) || 0,
                  saturation: Number(g.saturation) || 0,
                },
              });
            }
          } catch (_e) { /* behold den første maskering */ }
        }

        const optPath = l.photo.path.replace(/\.jpg$/i, "") + "-opt.jpg";
        const up = await supabase.storage.from("photos").upload(optPath, jpeg, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (up.error) continue;
        l.photo.path = optPath;
        l.photo.url = supabase.storage.from("photos").getPublicUrl(optPath).data.publicUrl;
        l.photo.optimized = true;
        l.buf = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer;
        l.mediaType = "image/jpeg";
      } catch (err) {
        console.error("optimering sprunget over for", l.photo.kind, err);
      }
    }

    if (loaded.some((l) => l.photo.optimized)) {
      await supabase.from("drafts").update({
        photos: loaded.map((l) => l.photo),
        image_path: loaded[0].photo.path,
        image_url: loaded[0].photo.url,
        personal_info: personalInfoSeen,
      }).eq("id", id);
    }

    // Cap what we send onward: the first few carry almost all the signal.
    const imageBlocks: unknown[] = [];
    for (const l of loaded.slice(0, 5)) {
      // Naming the shot lets the model read a blurry label photo for what it
      // is instead of guessing at a mystery close-up.
      imageBlocks.push({ type: "text", text: `Billede (${l.photo.kind || "ukendt vinkel"}):` });
      imageBlocks.push({
        type: "image",
        source: { type: "base64", media_type: l.mediaType, data: toBase64(l.buf) },
      });
    }

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
        "Pris: et konkret beløb i kr, sat som en reel salgsstrategi (se markedsdata), ikke bare et gennemsnit. " +
        "Udfyld desuden Vinteds egne felter — categoryPath, brand, size, sizeScale, color, condition — med Vinteds " +
        "egen danske ordlyd, for de bliver klikket direkte ind i formularen. Er du i tvivl om mærke eller størrelse, " +
        "så skriv null i stedet for at gætte; et forkert mærke er værre end et tomt felt.",
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
        title: cleanText(draft.title),
        description: cleanText(draft.description),
        category: cleanText(draft.category),
        condition: cleanText(draft.condition),
        price: cleanText(draft.price),
        price_note: cleanText(draft.priceNote),
        search_query: searchQuery,
        price_grounded: grounded,
        // Vinteds egne felter. Bogmaerket klikker dem igennem, saa de gemmes
        // her praecis som modellen formulerede dem. draft vinder over vision:
        // draft-kaldet kender Vinteds ordlyd, vision-kaldet laeser bare etiketten.
        brand: cleanText(draft.brand || vision.brand) || null,
        size: cleanText(draft.size || vision.size) || null,
        size_scale: cleanText(draft.sizeScale) || null,
        color: cleanText(draft.color || vision.color) || null,
        category_path: Array.isArray(draft.categoryPath) && draft.categoryPath.length
          ? draft.categoryPath.map((c: unknown) => cleanText(c)).filter(Boolean)
          : null,
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
