// Two phases, both called from the iOS Shortcut while it sits on
// vinted.dk's "Sælg en artikel" page.
//
//   GET  -> the newest ready draft + the search query to price it against
//   POST -> comparables the PHONE fetched from Vinted, in exchange for the
//           final market-grounded price
//
// The phone does the Vinted lookup because Vinted blocks datacenter IPs but
// never blocks a same-origin request from a real logged-in session. That
// makes pricing reliable in a way no server-side scrape was.
//
// Never touches the photo picker or the Upload button: photo attachment can't
// be scripted by any web page, and publishing stays the seller's own decision.
// Everything else — category, brand, size, condition, colour — the bookmarklet
// clicks through, so this endpoint hands it Vinted's own wording.

import { createClient } from "npm:@supabase/supabase-js@2";
import { RUNNER } from "./runner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function cleanText(value: unknown): string {
  let t = String(value ?? "");
  const cut = t.search(/<\/?\s*(description|parameter|title|price|invoke|function|antml)\b/i);
  if (cut > -1) t = t.slice(0, cut);
  return t.replace(/<[^>]*>/g, "").trim();
}

function plainPrice(price: string): string {
  return (price || "").replace(/[^\d.,]/g, "").replace(",", ".");
}

// Vinteds egne vaerdier. De bliver klikket direkte ind i formularen, saa de
// skal staa i Vinteds ordlyd - ikke i en fri oversaettelse.
const VINTED_CONDITIONS = [
  "Ny med prismærker", "Ny uden prismærker", "Meget god", "God", "Tilfredsstillende",
];
const VINTED_COLORS = [
  "Sort", "Grå", "Hvid", "Flødefarvet", "Beige", "Abrikos", "Orange", "Koral", "Rød",
  "Bourgogne", "Lyserød", "Rosa", "Lilla", "Lyslilla", "Lyseblå", "Blå", "Marineblå",
  "Turkis", "Mintgrøn", "Grøn", "Mørkegrøn", "Khaki", "Brun", "Sennepsgul", "Gul",
  "Sølv", "Guld", "Flerfarvet", "Klar",
];

const FIELDS_TOOL = {
  name: "saet_vinted_felter",
  description: "Udfyld Vinteds egne felter for varen, i Vinteds danske ordlyd.",
  input_schema: {
    type: "object",
    properties: {
      categoryPath: {
        type: "array",
        items: { type: "string" },
        description:
          'Vejen ned gennem Vinteds danske kategoritræ, fx ["Børn","Drengetøj","Overtøj","Jakker"]. ' +
          "Øverste niveau skal være ét af: Kvinder, Mænd, Børn, Bolig, Elektronik, Bøger og medier, " +
          "Hobby og samlerobjekter, Sport. Gå kun så dybt du er sikker på.",
      },
      brand: { type: ["string", "null"], description: "Mærkets navn som det staves på Vinted. null hvis ukendt." },
      size: { type: ["string", "null"], description: 'Størrelsen som på etiketten, fx "M", "152", "38". null hvis ukendt.' },
      sizeScale: { type: ["string", "null"], enum: ["S/M/L", "EU", "UK", "FR", "IT", "US", null] },
      color: { type: ["string", "null"], enum: [...VINTED_COLORS, null] },
      material: {
        type: ["string", "null"],
        description: 'Hovedmaterialet med Vinteds danske ord, fx "Bomuld", "Polyester", "Uld", "Læder".',
      },
      condition: { type: "string", enum: VINTED_CONDITIONS },
    },
    required: ["categoryPath", "condition"],
  },
};

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

type Block = Record<string, unknown>;

async function callTool(
  system: string,
  user: string | Block[],
  tool: Record<string, unknown>,
) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 700,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data?.content || []).find((b: { type?: string }) => b?.type === "tool_use");
  if (!block?.input) throw new Error("no_tool_use_in_response");
  return block.input as Record<string, unknown>;
}

// Kontrollen skal se VAREN, ikke bare laese om den. Laener den sig op ad
// beskrivelsen, arver den beskrivelsens fejl - og det var netop teksten, der
// kaldte en regnjakke for en softshell. Billedet er det eneste holdepunkt,
// der ikke kan vaere farvet af et tidligere kald.
async function photoBlocks(
  photos: unknown,
  kinds: string[],
  max = 2,
): Promise<Block[]> {
  const list = Array.isArray(photos) ? photos as Array<{ url?: string; kind?: string }> : [];
  if (!list.length) return [];
  const picked: Array<{ url?: string; kind?: string }> = [];
  for (const k of kinds) {
    const hit = list.find((p) => (p.kind || "").toLowerCase().includes(k));
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  if (!picked.length || picked.length < max) {
    const first = list[0];
    if (first && !picked.includes(first)) picked.unshift(first);
  }

  const blocks: Block[] = [];
  for (const p of picked.slice(0, max)) {
    if (!p.url) continue;
    try {
      const r = await fetch(p.url);
      if (!r.ok) continue;
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: r.headers.get("content-type") || "image/jpeg",
          data: await toBase64(await r.arrayBuffer()),
        },
      });
    } catch { /* et billede mindre er bedre end ingen kontrol */ }
  }
  return blocks;
}

// Udkast fra foer Vinted-felterne fandtes har dem ikke. Hellere udlede dem her,
// mens telefonen venter, end at lade saelgeren saette dem i haanden.
async function backfillFields(draft: Record<string, unknown>) {
  const out = await callTool(
    "Du er en meget erfaren sælger på Vinted med speciale i det danske marked. " +
      "Du placerer en vare præcist i Vinteds egen danske formular.",
    `Titel: ${draft.title}\nBeskrivelse: ${draft.description}\n` +
      `Kategori (fritekst): ${draft.category ?? ""}\nStand (fritekst): ${draft.condition ?? ""}\n` +
      `Mærke: ${draft.brand ?? "ukendt"}\nStørrelse: ${draft.size ?? "ukendt"}`,
    FIELDS_TOOL,
  );

  const derived: Record<string, unknown> = {
    category_path: Array.isArray(out.categoryPath) && out.categoryPath.length
      ? (out.categoryPath as unknown[]).map((c) => cleanText(c)).filter(Boolean)
      : null,
    brand: cleanText(out.brand) || null,
    size: cleanText(out.size) || null,
    size_scale: cleanText(out.sizeScale) || null,
    color: cleanText(out.color) || null,
    material: cleanText(out.material) || null,
    condition: cleanText(out.condition) || null,
  };

  // Kun de tomme felter fyldes. Det, en tidligere analyse allerede har fastslaaet
  // ud fra billederne, er bedre end et gaet ud fra titlen alene.
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(derived)) {
    const existing = draft[key];
    const empty = existing == null || existing === "" ||
      (Array.isArray(existing) && !existing.length);
    if (empty && value != null) fields[key] = value;
  }
  if (Object.keys(fields).length) {
    await supabase.from("drafts").update(fields).eq("id", draft.id);
  }
  return fields;
}

// Vinteds kategoritrae bruger sin helt egen ordlyd - "Toej til drenge", ikke
// "Drengetoej". Det kan ingen model gaette paalideligt. Derfor laeser telefonen
// de muligheder, der faktisk staar paa skaermen, og faar valgt et nummer her.
const CHOICE_TOOL = {
  name: "vaelg_mulighed",
  description: "Vælg den mulighed, der passer bedst til varen.",
  input_schema: {
    type: "object",
    properties: {
      index: {
        type: "integer",
        description: "Nummeret på den bedste mulighed. -1 hvis ingen passer, eller hvis vi allerede er præcise nok.",
      },
      reason: { type: "string", description: "Meget kort begrundelse" },
    },
    required: ["index"],
  },
};

const CHOICE_INTRO: Record<string, string> = {
  kategori:
    "Du står i Vinteds kategorivælger og skal ét niveau LÆNGERE NED.\n" +
    "Nogle punkter viser en HEL sti med > imellem. Det er Vinteds egne forslag ud fra titlen, og de " +
    "rammer ofte præcist dér, hvor varen hører hjemme. Passer en af dem på varen, så vælg den — " +
    "ét klik placerer varen korrekt med det samme. Passer ingen af dem, så vælg det almindelige punkt, " +
    "der fører videre ned mod varen.\n" +
    "Vær opmærksom på, at valget er ENVEJS: vælger du en gren, kan du ikke komme tilbage. Så læs alle " +
    "punkter igennem, før du vælger — særligt når to grene ligner hinanden (fx en gren til jakker " +
    "generelt og en gren til regntøj). Er varen regntøj, termotøj, skitøj eller andet med sin egen gren, " +
    "så tag dén gren frem for den almene.\n" +
    "Vælg altid et punkt, hvis bare ét af dem kan rumme varen; en lidt bred, men rigtig kategori er " +
    "langt bedre end ingen. Er køn ikke oplyst, så vælg alligevel den gren, der passer bedst. " +
    "Svar kun -1, hvis absolut intet punkt kan rumme varen.",
  størrelse:
    "Du står i Vinteds størrelsesvælger. Vælg den størrelse, der svarer til varens etiket. " +
    "Svar -1, hvis ingen af dem gør.",
  mærke: "Du står i Vinteds mærkeliste. Vælg præcis det mærke, varen er. Svar -1, hvis mærket ikke er på listen.",
  materiale:
    "Du står i Vinteds materialeliste. Vælg det materiale, varen hovedsageligt er lavet af. " +
    "Svar -1, hvis materialet ikke er oplyst eller ikke står på listen — gæt aldrig.",
};

async function chooseOption(
  draft: Record<string, unknown>,
  kind: string,
  chosen: string[],
  options: string[],
  hint?: string,
  avoid?: string[],
): Promise<number> {
  const list = options.map((o, i) => `${i}: ${o}`).join("\n");
  const where = chosen.length ? `Valgt indtil nu: ${chosen.join(" > ")}\n` : "";
  // Billedanalysen har allerede set varen. Dens bud er bedre end en gaetning
  // ud fra titlen alene - men Vinteds ordlyd vinder over dens formulering.
  // Et tidligere forsoeg blev forkastet ved kontrollen. Sig hvad, saa den
  // samme blindgyde ikke vaelges igen.
  const rejected = avoid && avoid.length
    ? `Følgende er allerede prøvet og forkastet som forkert: ${avoid.join(", ")}. Vælg noget andet.\n`
    : "";
  const suggested = hint
    ? `Billedanalysen foreslog her: "${hint}". Vælg det punkt, der ligger tættest på det, ` +
      "medmindre det tydeligvis er forkert.\n"
    : "";
  const out = await callTool(
    "Du er en meget erfaren sælger på Vinted med speciale i det danske marked. " +
      (CHOICE_INTRO[kind] || "Vælg den mulighed, der passer bedst."),
    `Vare: ${draft.title}\nBeskrivelse: ${draft.description}\n` +
      `Mærke: ${draft.brand ?? "ukendt"}\nStørrelse: ${draft.size ?? "ukendt"}\n\n` +
      `${where}${suggested}${rejected}Muligheder:\n${list}`,
    CHOICE_TOOL,
  );
  const i = Number(out.index);
  return Number.isInteger(i) && i >= 0 && i < options.length ? i : -1;
}

// Et valg, der ser rimeligt ud paa vejen ned, kan vaere forkert i bund. Her
// bedoemmes RESULTATET mod varen - et langt lettere spoergsmaal end at vaelge
// rigtigt i blinde, og det er sidste chance for at fange en forkert gren.
const VERIFY_TOOL = {
  name: "bedoem_valg",
  description: "Sig om den valgte værdi passer til varen.",
  input_schema: {
    type: "object",
    properties: {
      ok: { type: "boolean", description: "true hvis værdien passer til varen" },
      reason: { type: "string", description: "Én kort sætning, kun hvis den ikke passer" },
    },
    required: ["ok"],
  },
};

const VERIFY_PHOTOS: Record<string, string[]> = {
  // Kategorien skal se BAADE varen og stoerrelsesmaerkatet. Uden maerkatet er
  // der ingen maalestok paa et foto af en jakke paa et gulv, og en boernejakke
  // i str. 120 blev godtaget under damestoerrelser.
  "kategori": ["forfra", "stoerrelse"],
  "mærke": ["maerke", "brand"],
  "størrelse": ["stoerrelse", "size"],
  "materiale": ["stoerrelse", "maerke"],
};

async function verifyChoice(
  draft: Record<string, unknown>,
  kind: string,
  value: string,
): Promise<{ ok: boolean; reason: string }> {
  const images = await photoBlocks(draft.photos, VERIFY_PHOTOS[kind] || ["forfra"]);
  // Hverken titel eller beskrivelse med: de er skrevet af et tidligere kald, og
  // en kontrol, der faar dem at se, gentager bare deres fejl. Foerste udgave
  // her forkastede baade "Vindjakker" OG "Regnjakker" for den samme jakke,
  // fordi beskrivelsen sagde "softshell" og trak svaret med sig.
  const text = `Billederne viser varen — og hvor der er et mærkat med, hvad der står på det.\n` +
    `Feltet "${kind}" er sat til: ${value}\n` +
    `Passer det til det, du kan SE på billederne? Er værdien en hel kategoristi med > imellem, ` +
    `skal HELE stien passe — også om varen hører til under børn, kvinder eller mænd.`;

  const out = await callTool(
    "Du er en meget erfaren sælger på Vinted med speciale i det danske marked. " +
      "Du kontrollerer ét felt i en annonce, før den lægges op.\n" +
      "Døm UDELUKKENDE ud fra billederne. Du får hverken titel eller beskrivelse at se, " +
      "og det er med vilje: de kan være forkerte, og du skal være et uafhængigt øje.\n" +
      "Svar true, hvis værdien passer rimeligt til varen — også når en anden formulering kunne bruges. " +
      "Svar kun false, når værdien er decideret forkert og vil vildlede en køber: " +
      "fx en regnjakke sat under vindjakker, eller en kjole sat under nederdele. " +
      "Vær ikke kræsen for kræsenhedens skyld; et unødigt false koster sælgeren et helt omvalg.",
    images.length ? [...images, { type: "text", text }] : text,
    VERIFY_TOOL,
  );
  return { ok: out.ok !== false, reason: String(out.reason || "") };
}

const PRICE_TOOL = {
  name: "saet_pris",
  description: "Sæt den endelige pris ud fra sammenlignelige annoncer.",
  input_schema: {
    type: "object",
    properties: {
      price: { type: "string", description: 'Konkret beløb, fx "89 kr"' },
      priceNote: { type: "string", description: "Kort strategi-begrundelse, 1-2 sætninger" },
    },
    required: ["price", "priceNote"],
  },
};

async function priceFromComparables(
  draft: Record<string, unknown>,
  comparables: Array<{ title?: string; price?: string; currency?: string }>,
): Promise<{ price: string; priceNote: string }> {
  const lines = comparables
    .slice(0, 12)
    .map((c) => `${c.title || "(uden titel)"} — ${c.price} ${c.currency || "DKK"}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 600,
      system:
        "Du er en meget erfaren sælger på Vinted med speciale i det danske marked. " +
        "Du sætter prisen på en vare ud fra aktuelle, sammenlignelige annoncer. " +
        "Læg en reel strategi: lidt under median giver hurtigt salg, toppen kan bæres hvis stand og mærke berettiger det. " +
        "Begrund kort og konkret i priceNote, med henvisning til hvad feltet ligger på.",
      tools: [PRICE_TOOL],
      tool_choice: { type: "tool", name: PRICE_TOOL.name },
      messages: [{
        role: "user",
        content: `Vare: ${draft.title}\nStand: ${draft.condition}\nBeskrivelse: ${draft.description}\n\n` +
          `${comparables.length} aktive, sammenlignelige annoncer på Vinted DK:\n${lines}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data?.content || []).find((b: { type?: string }) => b?.type === "tool_use");
  if (!block?.input) throw new Error("no_tool_use_in_response");
  return block.input as { price: string; priceNote: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  // Samme automatik pakket som et brugerscript, saa Safari kan koere den af sig
  // selv, naar opret-siden aabnes. Versionsnummeret foelger indholdet, saa
  // Userscripts selv henter en ny udgave, naar der er rettet noget.
  // Userscripts tilbyder kun at installere, hvis selve STIEN ender paa
  // .user.js - et forespoergselsparameter er ikke nok. Supabase sender
  // undermapper videre til den samme funktion, saa filnavnet kan bare haenges
  // bagpaa.
  const wantsUserscript = url.pathname.endsWith(".user.js") ||
    url.searchParams.get("userscript") === "1";
  if (req.method === "GET" && wantsUserscript) {
    // Ikke url.origin: bag Supabase's router er det den interne adresse, og et
    // brugerscript skal kunne kalde hjem udefra.
    const base = `${SUPABASE_URL}/functions/v1/vinted-fill-script`;
    const api = `${base}?key=${SHORTCUT_KEY}`;
    const install = `${base}/udbakke.user.js?key=${SHORTCUT_KEY}`;
    let h = 0;
    for (let i = 0; i < RUNNER.length; i++) h = (h * 31 + RUNNER.charCodeAt(i)) >>> 0;
    const body = [
      "// ==UserScript==",
      "// @name         VintedAuto",
      "// @namespace    udbakke",
      `// @version      1.0.${h % 100000}`,
      "// @description  Udfylder Vinted-annoncen automatisk",
      "// @match        https://www.vinted.dk/items/new*",
      "// @match        https://vinted.dk/items/new*",
      "// @run-at       document-idle",
      "// @grant        none",
      "// @inject-into  page",
      `// @downloadURL  ${install}`,
      `// @updateURL    ${install}`,
      "// ==/UserScript==",
      "",
      `window.__UDBAKKE_API__=${JSON.stringify(api)};`,
      "window.__UDBAKKE_AUTO__=true;",
      RUNNER,
    ].join("\n");
    // text/plain, ikke text/javascript: ellers henter Safari filen ned i stedet
    // for at vise den, og saa har udvidelsen ingen side at tilbyde installation
    // paa. Det er ogsaa derfor GitHub udleverer .user.js som ren tekst.
    return new Response(body, {
      headers: {
        ...CORS,
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  // Bogmaerket er kun en indlaeser. Selve automatikken hentes her, saa den kan
  // rettes uden at bogmaerket skal installeres forfra paa telefonen.
  if (req.method === "GET" && url.searchParams.get("script") === "1") {
    return new Response(RUNNER, {
      headers: { ...CORS, "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (req.method === "GET") {
    // The app stamps selected_at when you tap "Udfyld i Vinted" on a specific
    // card, so two people sharing the queue never pull each other's draft.
    // Automatisk tilstand maa kun gribe ind, naar du netop har trykket "Udfyld i
    // Vinted" i appen. Ellers ville enhver tur forbi opret-siden faa en gammel
    // annonce skrevet ind under haenderne paa dig.
    const auto = url.searchParams.get("auto") === "1";
    const freshSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("drafts")
      .select(
        "id, title, description, price, search_query, price_grounded, " +
          "condition, brand, size, size_scale, color, material, category_path, category, photos",
      )
      .eq("status", "ny")
      .gte(auto ? "selected_at" : "created_at", auto ? freshSince : "1970-01-01")
      .order("selected_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ empty: true });

    // Udkast fra foer Vinted-felterne fandtes: udled dem nu, saa ogsaa gamle
    // udkast bliver fyldt helt ud.
    let row = data as Record<string, unknown>;
    const missing = !Array.isArray(row.category_path) || !row.category_path.length ||
      !row.material || !row.brand || !row.size || !row.color;
    if (missing) {
      try {
        row = { ...row, ...await backfillFields(row) };
      } catch (err) {
        console.error("backfill_fields failed", err);
      }
    }

    const photoUrls = (Array.isArray(row.photos) ? row.photos : [])
      .map((p: { url?: string }) => p?.url)
      .filter((u: unknown): u is string => typeof u === "string" && !!u);

    return json({
      id: data.id,
      photos: photoUrls,
      title: cleanText(data.title),
      description: cleanText(data.description),
      price: plainPrice(data.price || ""),
      searchQuery: data.search_query || data.title || "",
      needsPricing: !data.price_grounded,
      // Vinteds egne felter, i Vinteds egen ordlyd.
      categoryPath: Array.isArray(row.category_path) ? row.category_path : [],
      brand: cleanText(row.brand || ""),
      size: cleanText(row.size || ""),
      sizeScale: cleanText(row.size_scale || ""),
      color: cleanText(row.color || ""),
      material: cleanText(row.material || ""),
      condition: cleanText(row.condition || ""),
    });
  }

  if (req.method === "POST") {
    let body: {
      id?: string;
      comparables?: Array<Record<string, string>>;
      mode?: string;
      kind?: string;
      chosen?: unknown[];
      hint?: unknown;
      avoid?: unknown[];
      kind?: string;
      value?: unknown;
      options?: unknown[];
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    if (!body.id) return json({ error: "missing_id" }, 400);

    // Telefonen sender de muligheder, Vinted faktisk viser, og faar et nummer
    // tilbage. Saa behoever ingen at gaette Vinteds ordlyd.
    // Faerdig: markeringen ryddes, saa et genindlaes ikke skriver den samme
    // annonce ind igen.
    if (body.mode === "clear") {
      await supabase.from("drafts").update({ selected_at: null }).eq("id", body.id);
      return json({ ok: true });
    }

    if (body.mode === "verify") {
      const { data: d, error: e } = await supabase
        .from("drafts")
        .select("title, description, brand, photos")
        .eq("id", body.id)
        .single();
      if (e) return json({ error: e.message }, 500);
      try {
        return json(await verifyChoice(d as Record<string, unknown>, String(body.kind || ""), String(body.value ?? "")));
      } catch (err) {
        console.error("verify failed", err);
        // Kan der ikke kontrolleres, godkendes valget. Et tomt felt er vaerre
        // end et, der maaske kunne have vaeret mere praecist.
        return json({ ok: true, reason: "" });
      }
    }

    if (body.mode === "choose") {
      const { data: d, error: e } = await supabase
        .from("drafts")
        .select("title, description, brand, size")
        .eq("id", body.id)
        .single();
      if (e) return json({ error: e.message }, 500);
      const options = Array.isArray(body.options) ? body.options.map(String) : [];
      if (!options.length) return json({ index: -1 });
      try {
        const index = await chooseOption(
          d as Record<string, unknown>,
          String(body.kind || "kategori"),
          Array.isArray(body.chosen) ? body.chosen.map(String) : [],
          options,
          body.hint ? String(body.hint) : undefined,
          Array.isArray(body.avoid) ? body.avoid.map(String) : undefined,
        );
        return json({ index });
      } catch (err) {
        console.error("choose failed", err);
        return json({ index: -1 });
      }
    }

    const { data: draft, error: draftErr } = await supabase
      .from("drafts")
      .select("id, title, description, condition, price")
      .eq("id", body.id)
      .single();
    if (draftErr) return json({ error: draftErr.message }, 500);

    const comparables = body.comparables || [];
    if (!comparables.length) {
      // Nothing to price against — keep the provisional price rather than
      // pretending it was market-checked.
      return json({ price: plainPrice(draft.price || ""), grounded: false });
    }

    try {
      const result = await priceFromComparables(draft, comparables);
      await supabase
        .from("drafts")
        .update({
          price: cleanText(result.price),
          price_note: cleanText(result.priceNote),
          price_grounded: true,
        })
        .eq("id", body.id);
      return json({ price: plainPrice(result.price), priceNote: result.priceNote, grounded: true });
    } catch (err) {
      return json({
        price: plainPrice(draft.price || ""),
        grounded: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({ error: "method_not_allowed" }, 405);
});
