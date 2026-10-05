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
import { beslutPris, type Maaling, type Vagt } from "./prisvagt.ts";
import { BESKRIVELSE_REGLER, type Fakta, faktaTekst, slaaOp } from "../_shared/beskrivelse.ts";
import { hentErfaringer } from "../_shared/laering.ts";
import { laer } from "./laering.ts";
import { indkob } from "./indkob.ts";
import { erNy, erNyAnnonce, helKroner, iNyprisRamme, NYPRIS_REGEL, nyprisRamme } from "../_shared/pris.ts";

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

// Hele kroner som tekst, til felterne. Fortolkningen af "1.200" og "89,50"
// staar i _shared/pris.ts.
function plainPrice(price: string): string {
  const n = helKroner(price);
  return n > 0 ? String(n) : "";
}

// Prisen paa Vinted er hele kroner. Ingen decimaler, og aldrig under MIN_PRIS.
//
// En model svarer gerne 7,5 eller 12.50, og en gennemsnitsberegning giver af
// sig selv kommatal. Afrundingen sker FOER gulvet, saa 7,6 bliver til 8 ad den
// rigtige vej og ikke to gange.
//
// roundPrice loefter i forvejen alt under 100 til mindst 15, saa gulvet bider
// sjaeldent. Det staar her alligevel, saa reglen er en regel og ikke et
// sammentraef: aendrer nogen de 15, skal prisen stadig ikke kunne falde under.
const MIN_PRIS = 8;

function vintedPris(v: number): number {
  if (!isFinite(v) || v <= 0) return v;   // ingen pris er ikke en lav pris
  return Math.max(MIN_PRIS, Math.round(v));
}
function vintedPristekst(p: string): string {
  const n = Number(plainPrice(p));
  if (!isFinite(n) || n <= 0) return p;
  return `${vintedPris(n)} kr`;
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
      max_tokens: 1200,
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
  // Farven med maerket: staar der "Army" paa haengemaerket, er det facit, og
  // et foto alene saa en armygroen hoerskjorte som beige.
  "farve": ["forfra", "maerke"],
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
    `skal HELE stien passe — også om varen hører til under børn, kvinder eller mænd.` +
    (kind === "farve"
      ? `\nStår der et farvenavn på et mærke (fx "Army"), er det facit — lys og hvidbalance kan snyde på et foto.`
      : "");

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

// ---- Markedsanalyse -------------------------------------------------------
// Arbejdsdelingen: modellen doemmer HVILKE annoncer der er sammenlignelige og
// skriver teksten - det er skoen. Regnestykket laegges herude, for en model
// regner upaalideligt, og prisen er det eneste tal, saelgeren maerker paa
// pengepungen.

function stats(values: number[]) {
  const v = values.slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (f: number) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * f)))];
  return { n: v.length, min: v[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: v[v.length - 1] };
}

// Danske koebere skimmer og filtrerer i runde spring. 47 kr laeser som et
// tilfaeldigt tal; 45 laeser som en pris.
function roundPrice(n: number): number {
  if (n <= 0) return 0;
  if (n < 100) return Math.max(15, Math.round(n / 5) * 5);
  if (n < 300) return Math.round(n / 10) * 10;
  return Math.round(n / 25) * 25;
}

type MarketItem = {
  id?: number; title?: string; price?: number; favourites?: number;
  brand?: string; size?: string; condition?: string;
};

const LISTING_TOOL = {
  name: "skriv_annonce",
  description: "Skriv den færdige annonce og sæt prisen ud fra markedet.",
  input_schema: {
    type: "object",
    properties: {
      comparableIndexes: {
        type: "array",
        items: { type: "integer" },
        description:
          "Numrene på de annoncer, der reelt er sammenlignelige med varen: samme slags vare " +
          "(en jakke er ikke et sæt), nogenlunde samme størrelse, og en stand der kan måles imod. " +
          "Vær streng — hellere seks rigtige end tredive omtrentlige.",
      },
      title: {
        type: "string",
        description:
          "Titel på dansk. Købere søger på mærke + type + størrelse, så dét skal stå først og med " +
          "de ord, folk faktisk skriver. Ingen sælger-sprog, ingen udråbstegn.",
      },
      description: {
        type: "string",
        description:
          "Beskrivelse på dansk, 4-7 linjer, efter reglerne i systemprompten. Lad de medsendte " +
          "eksempler inspirere, hvilke oplysninger købere efterspørger — men skriv om DENNE vare.",
      },
      price: { type: "integer", description: "Prisen i hele kroner, uden enhed." },
      priceNote: {
        type: "string",
        description: "1-2 sætninger om strategien: hvor feltet ligger, og hvorfor prisen er sat dér.",
      },
    },
    required: ["comparableIndexes", "title", "description", "price", "priceNote"],
  },
};

const MARKET_SYSTEM =
  "Du er en meget erfaren sælger på Vinted med speciale i det danske marked, og du lever af at " +
  "varer bliver solgt — ikke af at de ligger pænt til skue.\n\n" +
  "Det vigtigste at forstå ved tallene nedenfor: Vinted skjuler solgte varer. De annoncer, du får " +
  "at se, er dem der IKKE er blevet solgt. Feltet skævvrider derfor opad, og medianen af de synlige " +
  "er systematisk højere end dét, de solgte varer faktisk gik for. Hjerter (favoritter) på en vare, " +
  "der stadig ligger der, betyder 'eftertragtet, men for dyr' — det er et loft, ikke et mål.\n\n" +
  "Sæt derfor prisen UNDER medianen for de sammenlignelige annoncer. Hvor meget under afhænger af " +
  "stand og komplethed: er varen i dårligere stand end feltet, skal der mere afstand; er den bedre " +
  "eller næsten ny, kan den ligge tæt på. Gå aldrig så lavt, at varen ser defekt ud — en pris, der " +
  "stikker af nedad, skaber mistanke frem for salg.\n\n" +
  "Skriv titel og beskrivelse, så varen bliver fundet og forstået. Døm varens stand og udseende ud " +
  "fra billedet, ikke ud fra det udkast, der allerede er skrevet — det kan være forkert. Nypris og " +
  "mål under Fakta er slået op og skal med.\n\n" + NYPRIS_REGEL + "\n\n" + BESKRIVELSE_REGLER;

async function analyseMarket(
  draft: Record<string, unknown>,
  items: MarketItem[],
  samples: Array<{ price?: number; favourites?: number; text?: string }>,
) {
  const list = items.slice(0, 60);
  const lines = list.map((it, i) =>
    `${i}: ${it.price} kr | ${it.favourites || 0} hjerter | ${it.brand || "uden mærke"} | ` +
    `str. ${it.size || "?"} | ${it.condition || "?"} | ${String(it.title || "").slice(0, 60)}`
  ).join("\n");

  const all = stats(list.map((i) => Number(i.price)).filter((n) => n > 0));
  const sampleText = samples.length
    ? "\n\nTekster fra de annoncer, flest har hjertet — til inspiration for tone og indhold, " +
      "ikke til afskrift:\n" +
      samples.map((s, i) => `${i + 1}. (${s.price} kr, ${s.favourites} hjerter) ${s.text}`).join("\n\n")
    : "";

  const images = await photoBlocks(draft.photos, ["forfra"], 1);
  const text =
    `Varen: ${draft.title}\nMærke: ${draft.brand ?? "ukendt"} · str. ${draft.size ?? "?"} · ` +
    `${draft.condition ?? "?"} · ${draft.material ?? "?"} · ${draft.color ?? "?"}\n` +
    `Nuværende udkast til beskrivelse (kan være forkert): ${draft.description}\n` +
    `${faktaTekst(draft.fakta)}\n\n` +
    `${list.length} aktive annoncer på Vinted DK lige nu` +
    (all ? ` (hele feltet: ${all.min}-${all.max} kr, median ${all.median} kr)` : "") + ":\n" +
    lines + sampleText +
    "\n\nVælg de reelt sammenlignelige, skriv annoncen, og sæt prisen.";

  const erfaringer = await hentErfaringer(["tekst", "pris"]);
  const out = await callTool(
    MARKET_SYSTEM + (erfaringer ? "\n\n" + erfaringer : ""),
    images.length ? [...images, { type: "text", text }] : text,
    LISTING_TOOL,
  );

  // Modellens egne udvalgte annoncer er grundlaget. Regnestykket laegges her.
  const chosen = (Array.isArray(out.comparableIndexes) ? out.comparableIndexes : [])
    .map((i: unknown) => list[Number(i)])
    .filter(Boolean)
    .map((i: MarketItem) => Number(i.price))
    .filter((n) => n > 0);
  const ref = stats(chosen.length >= 3 ? chosen : list.map((i) => Number(i.price)).filter((n) => n > 0));

  let price = Math.round(Number(out.price) || 0);
  let guarded = false;
  // En ny vare holdes op mod de NYE annoncer. Brugte skjorter til 20-59 kr er
  // ikke et loft for en ny til 349 kr - det var dem, der gav 35 kr (2.
  // oktober). Er der under tre nye at regne paa, saettes intet loft fra
  // feltet; saa er det nyprisens ramme nedenfor, der holder prisen.
  const ny = erNy(draft.fakta, draft.condition);
  const loftRef = ny
    ? stats(list.filter((i) => erNyAnnonce(i.condition)).map((i) => Number(i.price)).filter((n) => n > 0))
    : ref;
  const loftGyldigt = !!loftRef && (!ny || loftRef.n >= 3);
  if (ref && price > 0) {
    // Spaerren: uanset hvad modellen naaede frem til, maa prisen ikke lande paa
    // eller over medianen af de sammenlignelige. Det er hele pointen med at
    // ville saelge hurtigt, og en model glider let opad.
    const ceiling = loftGyldigt && loftRef ? Math.floor(loftRef.median * 0.92) : Infinity;
    if (price > ceiling) { price = ceiling; guarded = true; }
    // Og ikke saa lavt at varen ser defekt ud.
    const floor = Math.max(15, Math.floor(ref.p25 * 0.6));
    if (price < floor) { price = floor; guarded = true; }
  }
  // Nyprisens ramme til sidst: gulvet vinder over feltets loft.
  const ramme = iNyprisRamme(price, nyprisRamme(draft.fakta, draft.condition));
  price = vintedPris(roundPrice(ramme.pris));

  return {
    title: cleanText(out.title),
    description: cleanText(out.description),
    price,
    priceNote: cleanText(out.priceNote) + (ramme.note ? ` (${ramme.note})` : guarded ? " (justeret til feltet)" : ""),
    compared: chosen.length,
    median: ref ? ref.median : null,
  };
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

// ---- Koeber-assistent: svar paa spoergsmaal, modbyd paa bud -----------------
// Hjernen bag ét-tryks-svaret. Telefonens userscript laeser samtalen og
// varen af Vinted-siden og sender dem hertil; serveren skriver svaret eller
// beregner modbuddet. Selve afsendelsen sker foerst, naar du trykker send -
// en udadvendt handling med en rigtig koeber og rigtige penge maa ikke ske
// tavst, og en auto-svarende bot er dét, der faar en konto lukket.
const NEGOTIATE_TOOL = {
  name: "svar_koeber",
  description: "Skriv svaret til koeberen, eller beregn et modbud paa et bud.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["answer", "counter", "accept", "defer"],
        description:
          "answer: et fagligt svar paa et spoergsmaal. counter: et modbud paa et bud. " +
          "accept: buddet er godt nok til at tage imod. defer: kan ikke svares fra varens " +
          "data (fx leveringstid, personlig aftale) - overlad det til saelgeren.",
      },
      message: {
        type: "string",
        description:
          "Beskeden til koeberen paa dansk. Kort, venlig, konkret. Ved 'defer' maa den " +
          "gerne vaere tom eller et forslag til, hvad saelgeren selv kan skrive.",
      },
      counterPrice: {
        type: "integer",
        description: "Kun ved intent=counter: modbuddet i hele kroner.",
      },
      note: {
        type: "string",
        description: "Én kort linje til SAELGEREN om hvorfor - vises, men sendes ikke.",
      },
      emne: {
        type: "string",
        enum: ["maal", "pasform", "stand", "materiale", "pris", "levering", "andet"],
        description: "Hvad koeberen mest spoerger om. Et rent bud uden spoergsmaal er 'pris'.",
      },
    },
    required: ["intent", "message", "note", "emne"],
  },
};

// Markedet er ikke det samme. DBA-koebere betaler typisk mere for samme vare
// end paa Vinted (maalt: CeLaVi-regnjakker 50-100 kr paa DBA mod Vinted-skoen
// paa 35). Udbudsprisen herunder er allerede sat til den rigtige platform, saa
// modbuddet er forankret korrekt - men modellen skal VIDE hvilket marked den
// staar i, saa den ikke doemmer en hoej DBA-pris som for hoej og byder for
// langt ned.
const MARKEDER: Record<string, string> = {
  vinted: "Du saelger paa Vinted. Prisen er sat til hurtigt salg, saa hold igen med at give for meget yderligere.",
  dba: "Du saelger paa DBA. DBA er et hoejere marked end Vinted - koebere dér betaler typisk mere for samme vare, og der forhandles gerne. Udbudsprisen er allerede sat til DBA's marked, saa den er ikke for hoej; forsvar den roligt.",
  reshopper: "Du saelger paa Reshopper (dansk boern/familie-genbrug). Der forhandles venligt og i det smaa.",
};

async function negotiate(
  item: Record<string, unknown>,
  buyerMessage: string,
  offer: number,
  platform: string,
  listingId: string | null = null,
): Promise<Record<string, unknown>> {
  const listed = Number(plainPrice(String(item.price ?? ""))) || 0;
  const facts = [
    item.title && `Titel: ${cleanText(item.title)}`,
    item.brand && `Maerke: ${cleanText(item.brand)}`,
    item.size && `Stoerrelse: ${cleanText(item.size)}`,
    item.condition && `Stand: ${cleanText(item.condition)}`,
    item.material && `Materiale: ${cleanText(item.material)}`,
    listed && `Udbudspris: ${listed} kr`,
    item.description && `Beskrivelse: ${cleanText(item.description)}`,
  ].filter(Boolean).join("\n");

  const markedsnote = MARKEDER[platform] || "Du er en erfaren dansk genbrugssaelger.";
  const system =
    "Du er en erfaren, venlig dansk genbrugssaelger. " + markedsnote + " Du svarer koebere kort og konkret. " +
    "Svar KUN ud fra varens data herunder. Kan spoergsmaalet ikke besvares derfra - " +
    "leveringstid, personlige aftaler, om du vil holde varen - saa vaelg 'defer' og find " +
    "ikke paa noget. Ved et bud: er buddet paa eller over udbudsprisen, saa 'accept'. Ellers " +
    "'counter' med et modbud mellem buddet og udbudsprisen - aldrig over din egen pris, aldrig " +
    "under buddet, og hele kroner. Begrund modbuddet kort med stand eller maerke. Vaer aldrig " +
    "presset eller anmassende. Skriv positivt og varmt om varen, tilbyd aldrig bytte, og tilbyd " +
    "ikke at maale op eller tage flere billeder - staar maalet ikke i varens data, saa 'defer'.";

  const parts: string[] = [facts];
  if (offer > 0) parts.push(`\nKoeberen har budt ${offer} kr.`);
  if (buyerMessage) parts.push(`\nKoeberens besked: "${buyerMessage.slice(0, 800)}"`);
  parts.push("\nSkriv svaret, eller beregn modbuddet.");

  const erfaringer = await hentErfaringer(["kommunikation"]);
  const out = await callTool(system + (erfaringer ? "\n\n" + erfaringer : ""), parts.join("\n"), NEGOTIATE_TOOL);
  const intent = String(out.intent || "defer");

  // Serveren har det sidste ord om tallet - en model glider. Et modbud skal
  // ligge OVER buddet og PAA/UNDER din egen pris, ellers giver det ikke mening.
  let counterPrice: number | undefined;
  if (intent === "counter") {
    let c = vintedPris(Number(out.counterPrice) || 0);
    if (listed > 0 && c > listed) c = listed;                 // aldrig over egen pris
    if (offer > 0 && c <= offer) {                            // skal slaa buddet
      c = listed > offer ? vintedPris((offer + listed) / 2) : vintedPris(offer + 1);
    }
    counterPrice = c;
  }

  // Hvad koeberne spoerger om, er en af de faa ting, der fortaeller, hvad
  // teksten manglede. Gemmes til gennemgangen; en fejl her maa ikke koste svaret.
  const { error: logFejl } = await supabase.from("koeber_beskeder").insert({
    listing_id: listingId,
    platform: platform || null,
    item_title: item.title ? cleanText(item.title).slice(0, 200) : null,
    buyer_message: buyerMessage.slice(0, 800) || null,
    offer: offer || null,
    intent,
    emne: out.emne ? String(out.emne) : null,
    reply: cleanText(out.message || "").slice(0, 2000) || null,
    counter_price: counterPrice ?? null,
  });
  if (logFejl) console.error("koeber_beskeder", logFejl.message);

  return {
    intent,
    message: cleanText(out.message || ""),
    note: cleanText(out.note || ""),
    ...(counterPrice ? { counterPrice } : {}),
  };
}

// Et salg er ny viden. Gennemgangen tager et kald til modellen, saa den koerer
// efter svaret og ikke i vejen for det.
function laerIBaggrunden() {
  const p = laer(supabase, ANTHROPIC_API_KEY).catch((err) => console.error("laer", err));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

// ---- Prisvagt -------------------------------------------------------------
// Serveren husker og beslutter; telefonen maaler og skriver ind. Den deling er
// ikke et valg: Vinted blokerer datacenter-IP'er, saa markedet kan kun ses fra
// din egen session — og prisen kan kun aendres i Vinteds egen formular.

// Er varen solgt paa Vinted, skal den ned de andre steder, den er sendt hen.
// DBA og Reshopper kan appen ikke selv tage ned - saa siger beskeden det.
async function ogsaaNedePaa(draftIds: unknown[]): Promise<string> {
  const ids = draftIds.filter((x): x is string => typeof x === "string" && !!x);
  if (!ids.length) return "";
  const { data } = await supabase.from("drafts").select("posted_to, taget_ned").in("id", ids);
  const navne = new Set<string>();
  for (const d of data ?? []) {
    const sendt = (d.posted_to ?? {}) as Record<string, string>;
    const ned = (d.taget_ned ?? {}) as Record<string, string>;
    if (sendt.dba && !ned.dba) navne.add("DBA");
    if (sendt.reshopper && !ned.reshopper) navne.add("Reshopper");
  }
  return navne.size ? " Slet den også på " + [...navne].join(" og ") + "." : "";
}

async function puf(title: string, body: string) {
  const hemmelighed = Deno.env.get("WEBHOOK_SECRET");
  if (!hemmelighed) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": hemmelighed },
      body: JSON.stringify({ title, body, url: "/vinted-udbakke/" }),
    });
  } catch { /* en manglende notifikation maa aldrig vaelte en prisjustering */ }
}

// Annoncen er landet. Herfra er den prisvagtens.
// Annoncens egne oplysninger, renset. Modellen for hvad vi gemmer er den
// samme hver gang, saa appen ikke skal gaette paa formen.
function renUdgivet(u: unknown): Record<string, unknown> | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const tekst = (v: unknown) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t ? t.slice(0, 4000) : null;
  };
  const pris = Math.round(Number(o.price) || 0);
  return {
    price: pris > 0 ? pris : null,
    title: tekst(o.title),
    description: tekst(o.description),
    brand: tekst(o.brand),
    size: tekst(o.size),
    condition: tekst(o.condition),
    color: tekst(o.color),
    url: tekst(o.url),
    kilde: tekst(o.kilde),
  };
}

// Samme tekst med et ekstra mellemrum eller et stort begyndelsesbogstav er
// ikke en aendring. Samme maaling som i appen og runneren.
function ensLyd(a: unknown, b: unknown): boolean {
  const n = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return n(a) === n(b);
}

// Din profil paa Vinted (vinted.dk/member/3125670782). Garderoben dér er det
// eneste sted, telefonen kan se, at en ny annonce er landet: Vinted sender dig
// IKKE videre til annoncens side efter Upload - det var et gaet, og ingen af
// nr. 5-20 blev nogensinde tilknyttet ad den vej.
const VINTED_BRUGER = "3125670782";

async function registrer(
  draftId: string,
  platform: string,
  externalId: string,
  url: string,
  pris: number,
  udgivet?: unknown,
  note = "lagt op på " + platform,
) {
  if (!externalId) return null;
  const { data: findes } = await supabase.from("listings")
    .select("id").eq("platform", platform).eq("external_id", externalId).maybeSingle();
  if (findes) return findes.id as string;

  const { data: d } = await supabase.from("drafts")
    .select("title, search_query, price").eq("id", draftId).maybeSingle();
  const p = Math.round(pris > 0 ? pris : Number(plainPrice(String(d?.price ?? ""))) || 0);
  if (!(p > 0)) return null;

  const { data: ny, error } = await supabase.from("listings").insert({
    draft_id: draftId,
    platform,
    external_id: externalId,
    url,
    title: cleanText(d?.title ?? ""),
    search_query: d?.search_query || cleanText(d?.title ?? ""),
    price: p,
    start_price: p,
    published: renUdgivet(udgivet),
    synced_at: udgivet ? new Date().toISOString() : null,
    // Foerste tjek efter en uge. Foer da ved ingen noget: en vare kan ligge
    // fem dage og saa blive solgt paa den sjette, og en nedsaettelse dagen
    // foer havde bare vaeret foraeret vaek.
    next_check_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  }).select("id").single();
  if (error) { console.error("registrer failed", error); return null; }

  await supabase.from("price_events").insert({
    listing_id: ny.id, kind: "oprettet", price: p, note,
  });
  return ny.id as string;
}

// Hvor ens er to titler? Ord for ord, uden de ord alle titler har. Vinteds
// markedsrunde kan have rettet titlen inden Upload ("regndragt" blev til
// "regntoej" paa nr. 22), saa der kraeves ikke samme tekst - kun de fleste ord.
const FYLDORD = new Set(["str", "og", "i", "med", "til", "ny", "nye", "helt", "kr"]);
function titelOrd(t: unknown): Set<string> {
  return new Set(String(t ?? "").toLowerCase().split(/[^a-z0-9æøåäöü]+/)
    .filter((o) => o.length > 1 && !FYLDORD.has(o)));
}
function titelLighed(a: unknown, b: unknown): number {
  const A = titelOrd(a), B = titelOrd(b);
  if (!A.size || !B.size) return 0;
  let faelles = 0;
  for (const o of A) if (B.has(o)) faelles++;
  return 2 * faelles / (A.size + B.size);
}

// Se kommentaren ved mode 'efterloeb'. Uden varer svarer den kun, om der er
// noget at lede efter - saa telefonen ikke henter garderoben (~60 kB) paa
// hver eneste annonceside.
async function efterloeb(varer: unknown) {
  const graense = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: udfyldte } = await supabase.from("drafts")
    .select("id, nr, title, price, posted_to, status")
    .not("posted_to->>vinted", "is", null)
    .gte("posted_to->>vinted", graense)
    .neq("status", "kasseret");
  const { data: kendte } = await supabase.from("listings")
    .select("draft_id, external_id").eq("platform", "vinted");
  const tilknyttet = new Set((kendte ?? []).map((l) => l.draft_id));
  const loese = (udfyldte ?? []).filter((d) => !tilknyttet.has(d.id));
  if (!Array.isArray(varer)) {
    return { behov: loese.length > 0, bruger: VINTED_BRUGER };
  }

  // Kun annoncer, der er nyere end den nyeste tilknyttede, og som ingen har.
  // Vinteds numre stiger - samme vaern som i mode 'posted'.
  const nyeste = Math.max(0, ...(kendte ?? []).map((l) => Number(l.external_id) || 0));
  const brugte = new Set((kendte ?? []).map((l) => String(l.external_id)));
  const nye = (varer as Array<Record<string, unknown>>)
    .filter((v) => v && !v.is_draft && Number(v.id) > nyeste && !brugte.has(String(v.id)))
    .sort((a, b) => Number(a.id) - Number(b.id));

  const tilbage = [...loese];
  const fundet: Array<{ nr: unknown; item_id: string }> = [];
  for (const v of nye) {
    const pris = Math.round(Number(v.price) || 0);
    const point = tilbage.map((d) => ({
      d,
      p: titelLighed(d.title, v.title) +
        (pris > 0 && Number(plainPrice(String(d.price ?? ""))) === pris ? 0.1 : 0),
    })).sort((a, b) => b.p - a.p);
    const [a, b] = point;
    // Halvdelen af ordene, og klart bedre end naestbedste. Hellere en annonce
    // uden udkast end en annonce paa det forkerte udkast.
    if (!a || a.p < 0.5 || (b && b.p > a.p - 0.15)) {
      console.log("efterloeb: ingen sikker parring", v.id, v.title,
        point.slice(0, 2).map((x) => `${x.d.nr}:${x.p.toFixed(2)}`).join(" "));
      continue;
    }
    const id = String(v.id);
    const vagt = await registrer(
      a.d.id, "vinted", id,
      String(v.url ?? `https://www.vinted.dk/items/${id}`), pris,
      { title: v.title, price: pris, brand: v.brand, size: v.size,
        condition: v.status, url: v.url, kilde: "garderobe" },
      "fundet i garderoben (efterløb)",
    );
    if (!vagt) continue;
    // Lagt ud lige efter udfyldningen - ikke da efterloebet fandt den.
    // Ellers ville en annonce fundet tre dage senere se tre dage yngre ud
    // for gennemgangen af salgene.
    const ud = (a.d.posted_to as Record<string, string> | null)?.vinted;
    await supabase.from("listings").update({
      ...(ud ? { listed_at: ud } : {}),
      synced_at: new Date().toISOString(),
    }).eq("id", vagt);
    await supabase.from("drafts").update({ selected_at: null }).eq("id", a.d.id);
    console.log("efterloeb: nr", a.d.nr, "->", id, a.p.toFixed(2));
    fundet.push({ nr: a.d.nr, item_id: id });
    tilbage.splice(tilbage.indexOf(a.d), 1);
  }
  return { ok: true, fundet };
}

async function hentForfaldne(maks = 3) {
  const { data } = await supabase.from("listings")
    .select("id, external_id, url, title, search_query, price, platform, next_check_at")
    .eq("status", "aktiv").eq("auto", true).eq("platform", "vinted")
    .not("external_id", "is", null)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(maks);
  return data ?? [];
}

// Telefonens maalinger ind, beslutninger ud.
async function tilsyn(maalinger: Maaling[]) {
  const ids = maalinger.map((m) => String(m.id)).filter(Boolean);
  if (!ids.length) return { beslutninger: [] as unknown[] };

  const { data: raekker } = await supabase.from("listings").select("*").in("id", ids);
  const { data: hist } = await supabase.from("price_events")
    .select("listing_id, at, kind, price, from_price, favourites")
    .in("listing_id", ids).order("at", { ascending: false }).limit(200);

  const ud: unknown[] = [];
  let solgte = 0, aendringer = 0;
  const solgteUdkast: unknown[] = [];

  const erf = await hentErfaringer(["pris"]);
  const prisErfaringer = erf ? "\n\n" + erf : "";

  for (const m of maalinger) {
    const r = (raekker ?? []).find((x) => x.id === m.id);
    if (!r) continue;

    // Er varen vaek fra Vinted, er den solgt eller taget hjem. Uanset hvad er
    // der ikke mere for prisvagten at lave.
    if (m.gone) {
      await supabase.from("listings").update({
        status: "solgt", sold_at: new Date().toISOString(),
        last_check_at: new Date().toISOString(), pending: null, pending_note: null,
      }).eq("id", r.id);
      await supabase.from("price_events").insert({
        listing_id: r.id, kind: "solgt", price: r.price,
        note: "annoncen findes ikke længere på Vinted",
      });
      solgte++;
      solgteUdkast.push(r.draft_id);
      laerIBaggrunden();
      ud.push({ id: r.id, handling: "solgt" });
      continue;
    }

    const v: Vagt = {
      id: r.id, title: r.title ?? "", platform: r.platform,
      price: Number(r.price), start_price: Number(r.start_price),
      floor_price: r.floor_price === null ? null : Number(r.floor_price),
      listed_at: r.listed_at, last_change_at: r.last_change_at,
      checks: Number(r.checks ?? 0),
      favourites: Number(r.favourites ?? 0), favourites_prev: Number(r.favourites_prev ?? 0),
      historik: (hist ?? []).filter((h) => h.listing_id === r.id),
    };

    let b;
    try {
      b = await beslutPris(v, m, (sys, u, t) => callTool(sys + prisErfaringer, u as string, t as Record<string, unknown>));
    } catch (err) {
      console.error("beslutPris failed", err);
      // En fejl her maa ikke sende varen i en tjek-loekke hvert minut.
      await supabase.from("listings").update({
        last_check_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      }).eq("id", r.id);
      continue;
    }

    const nuPris = m.price && m.price > 0 ? Math.round(m.price) : Number(r.price);
    const hjerter = Number.isFinite(m.favourites as number) ? Number(m.favourites) : Number(r.favourites ?? 0);
    const opd: Record<string, unknown> = {
      last_check_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + b.naesteTjekDage * 86400000).toISOString(),
      checks: Number(r.checks ?? 0) + 1,
      favourites: hjerter,
      favourites_prev: Number(r.favourites ?? 0),
      views: Number(m.views ?? r.views ?? 0),
      // Er prisen paa Vinted en anden end den, vi tror, er det Vinted der har
      // ret. Du kan have rettet den selv.
      price: nuPris,
    };
    const snap = renUdgivet((m as unknown as { udgivet?: unknown }).udgivet);
    if (snap) { opd.published = snap; opd.synced_at = new Date().toISOString(); }

    await supabase.from("price_events").insert({
      listing_id: r.id, kind: "maalt", price: nuPris, favourites: hjerter,
      comparables: b.sammenlignelige, median: b.median,
      note: b.handling + (b.spaerret ? " · " + b.spaerret : ""),
    });

    if (b.handling === "saenk" && b.nyPris > 0 && b.nyPris < nuPris) {
      // Samme postkasse som appens egne rettelser: ét sted at kigge, naar
      // spoergsmaalet er "hvad mangler at blive skrevet ind i annoncen".
      opd.pending = { price: b.nyPris };
      opd.pending_note = b.begrundelse;
      opd.pending_since = new Date().toISOString();
      await supabase.from("price_events").insert({
        listing_id: r.id, kind: "forslag", price: b.nyPris, from_price: nuPris,
        favourites: hjerter, median: b.median, comparables: b.sammenlignelige,
        note: b.begrundelse,
      });
      aendringer++;
    } else {
      opd.pending = null;
      opd.pending_note = null;
      opd.pending_since = null;
      opd.note = b.begrundelse;
      if (b.handling === "stop") {
        // Prisen er ikke laengere haandtaget. Vagten holder op med at saenke,
        // men varen bliver staaende i listen — det er en besked, ikke en
        // oprydning.
        opd.auto = false;
        await supabase.from("price_events").insert({
          listing_id: r.id, kind: "bund", price: nuPris, note: b.begrundelse,
        });
      }
    }

    await supabase.from("listings").update(opd).eq("id", r.id);
    ud.push({
      id: r.id, externalId: r.external_id, handling: b.handling,
      nyPris: b.nyPris, fraPris: nuPris, begrundelse: b.begrundelse,
    });
  }

  if (solgte) {
    await puf("Solgt!", solgte + (solgte === 1 ? " vare er væk fra Vinted." : " varer er væk fra Vinted.") +
      await ogsaaNedePaa(solgteUdkast));
  }
  if (aendringer) {
    await puf("Prisvagt", aendringer === 1
      ? "1 vare er klar til en ny pris"
      : aendringer + " varer er klar til en ny pris");
  }
  return { beslutninger: ud };
}


// "Safari paa iPhone" er nok til at kende telefonen fra Macen.
function browserNavn(ua: string): string {
  const enhed = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad"
    : /Macintosh/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : "computer";
  const b = /CriOS|Chrome/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : "Safari";
  return b + " på " + enhed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  // Samme automatik pakket som et brugerscript, saa Safari kan koere den af sig
  // selv, naar opret-siden aabnes. Versionsnummeret foelger indlaeseren, som
  // kun aendrer sig, hvis selve adressen goer - runneren hentes frisk hver gang.
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
    // Brugerscriptet er kun en indlaeser, ligesom bogmaerket. Foer bar det
    // runneren indbagt, og saa ramte en rettelse foerst telefonen, naar
    // Userscripts gad opdatere: 2. oktober blev nr. 19-21 lagt op med en runner,
    // der var to udgivelser bagud, og ingen af dem blev tilknyttet.
    const indlaeser = [
      `window.__UDBAKKE_API__=${JSON.stringify(api)};`,
      "window.__UDBAKKE_AUTO__=true;",
      "(function(){",
      " var x=new XMLHttpRequest();",
      " x.open('GET',window.__UDBAKKE_API__+'&script=1');",
      " x.onload=function(){if(x.status===200)(0,eval)(x.responseText)};",
      " x.send();",
      "})();",
    ].join("\n");
    let h = 0;
    for (let i = 0; i < indlaeser.length; i++) h = (h * 31 + indlaeser.charCodeAt(i)) >>> 0;
    const body = [
      "// ==UserScript==",
      "// @name         VintedAuto",
      "// @namespace    udbakke",
      `// @version      1.0.${h % 100000}`,
      "// @description  Udfylder Vinted-annoncen og holder appen synkroniseret",
      "// @match        https://www.vinted.dk/items/*",
      "// @match        https://vinted.dk/items/*",
      "// @run-at       document-idle",
      "// @grant        none",
      "// @inject-into  page",
      `// @downloadURL  ${install}`,
      `// @updateURL    ${install}`,
      "// ==/UserScript==",
      "",
      indlaeser,
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
    // Automatikken hentes ved hver sideindlaesning. Tidspunktet staar i appens
    // opsaetning, saa det kan ses, om telefonen faktisk koerer den.
    await supabase.from("puls").upsert({
      navn: "vinted-runner", sidst: new Date().toISOString(),
      detalje: browserNavn(req.headers.get("user-agent") || ""),
    }).then(() => {}, () => {});
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
      // Din Vinted-profil. Runneren holder oeje med garderoben efter
      // udfyldningen: den nye annonce er den, der dukker op dér.
      vintedBruger: VINTED_BRUGER,
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
      items?: unknown[];
      samples?: unknown[];
      hint?: unknown;
      avoid?: unknown[];
      value?: unknown;
      options?: unknown[];
      item?: Record<string, unknown>;
      buyerMessage?: string;
      offer?: number;
      platform?: string;
      item_id?: string;
      url?: string;
      price?: number;
      maalinger?: Maaling[];
      listing?: string;
      udgivet?: Record<string, unknown> | null;
      felter?: unknown;
      gone?: boolean;
      favourites?: number;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    // Koeber-assistenten arbejder ud fra dét, telefonen laeser af Vinted-siden,
    // ikke fra et udkast. Derfor er den her FOER id-vaernet: den daekker enhver
    // vare, du har til salg - ogsaa dem appen ikke selv har lagt op.
    if (body.mode === "negotiate") {
      const item = (body.item && typeof body.item === "object") ? body.item : {};
      const buyerMessage = typeof body.buyerMessage === "string" ? body.buyerMessage : "";
      const offer = Number(body.offer) > 0 ? Number(body.offer) : 0;
      const platform = String(body.platform ?? "").toLowerCase();
      if (!buyerMessage && !offer) return json({ error: "empty_context" }, 400);
      const listingId = typeof body.listing === "string" && /^[0-9a-f-]{36}$/.test(body.listing) ? body.listing : null;
      try {
        return json(await negotiate(item, buyerMessage, offer, platform, listingId));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Gennemgangen af udfaldene. Kaldes af appen, af det ugentlige job og
    // efter et salg - den handler om alle annoncer, ikke om ét udkast.
    if (body.mode === "laer") {
      try {
        return json(await laer(supabase, ANTHROPIC_API_KEY));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Indkoebet: hvilke ubrugte varer dine egne salg siger, det er let at
    // saelge igen - pr. kategori og pr. produkt. Kun laesning; intet gemmes.
    if (body.mode === "indkob") {
      try {
        return json(await indkob(supabase, ANTHROPIC_API_KEY));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Runnerens egne trin, til loggen. Telefonens konsol kan ikke ses
    // herfra, og 2. oktober kunne loggen ikke sige, om nr. 22 strandede paa
    // garderoben eller paa en fane, iOS havde lagt til at sove.
    if (body.mode === "spor") {
      console.log("spor", String(body.id ?? "-").slice(0, 8),
        String((body as { tekst?: unknown }).tekst ?? "").slice(0, 600));
      return json({ ok: true });
    }

    // Efterloebet. Fanen, der fyldte formularen, skal selv se den nye
    // annonce i garderoben - men den kan vaere lukket, eller iOS kan have
    // lagt den til at sove, foer Upload var faerdig. Saa hver gang runneren
    // koerer paa en Vinted-side, spoerger den her: ligger der et udkast, der
    // er udfyldt i Vinted, men ikke tilknyttet? Er svaret ja, sender den
    // garderobens nyeste, og de parres med udkastene paa titlen.
    if (body.mode === "efterloeb") {
      return json(await efterloeb(body.items));
    }

    // Prisvagtens tre kald staar ogsaa foer id-vaernet: de handler om en
    // annonce, ikke om et udkast, og et udkast kan vaere kasseret laenge foer
    // varen er solgt.
    if (body.mode === "due") {
      const raekker = await hentForfaldne(3);
      return json({
        forfaldne: raekker.map((r) => ({
          id: r.id,
          itemId: r.external_id,
          title: r.title,
          query: r.search_query || r.title || "",
          price: Number(r.price),
        })),
      });
    }

    // Redigeringssiden spoerger selv: skal DENNE annonce have en ny pris?
    // Uden det ville en prisaendring kun kunne gennemfoeres i forlaengelse af
    // det tilsyn, der besluttede den — og saa var den vaek dagen efter.
    if (body.mode === "pending") {
      const it = String(body.item_id ?? "");
      if (!it) return json({ error: "mangler" }, 400);
      const { data: r } = await supabase.from("listings")
        .select("id, price, pending, pending_note")
        .eq("platform", "vinted").eq("external_id", it).maybeSingle();
      const p = r?.pending as Record<string, unknown> | null;
      if (!r || !p || !Object.keys(p).length) return json({ pending: null });
      return json({ pending: { listing: r.id, felter: p,
        fra: Number(r.price), note: r.pending_note } });
    }

    // Én annonce, laest paa opfordring. Serveren gemmer annoncens egne ord ved
    // siden af udkastet - udkastet selv roeres ikke: forskellen mellem dem er
    // netop dét, appen skal kunne vise.
    if (body.mode === "synk") {
      const it = String(body.item_id ?? "");
      if (!it) return json({ error: "mangler" }, 400);
      const { data: r } = await supabase.from("listings")
        .select("id, price, status, published, pending, draft_id, title")
        .eq("platform", "vinted").eq("external_id", it).maybeSingle();
      if (!r) return json({ ukendt: true });

      if (body.gone) {
        // En lukket annonce kan blive laest igen — og mailen fra Vinted kan
        // have meldt den solgt foerst. Den er solgt én gang.
        if (r.status !== "aktiv") return json({ ok: true, gone: true });
        await supabase.from("listings").update({
          status: "solgt", sold_at: new Date().toISOString(),
          pending: null, pending_note: null, synced_at: new Date().toISOString(),
        }).eq("id", r.id);
        await supabase.from("price_events").insert({
          listing_id: r.id, kind: "solgt", price: Number(r.price),
          note: "annoncen findes ikke længere på Vinted",
        });
        laerIBaggrunden();
        await puf("Solgt!", (r.title || "En vare") + " er væk fra Vinted." +
          await ogsaaNedePaa([r.draft_id]));
        return json({ ok: true, gone: true });
      }

      const snap = renUdgivet(body.udgivet);
      const nu = Math.round(Number(body.price) || 0);
      const opd: Record<string, unknown> = { synced_at: new Date().toISOString() };
      if (snap) opd.published = snap;
      if (nu > 0) opd.price = nu;
      if (Number.isFinite(Number(body.favourites))) opd.favourites = Number(body.favourites);

      // Rettet paa Vinted, ikke i appen. Det skal staa i historikken som
      // enhver anden aendring: prisvagten regner sin ro fra last_change_at, og
      // gennemgangen af salgene taeller nedsaettelser. En pris, der stille
      // flyttede sig uden at blive noteret, ville se ud som den startpris,
      // varen aldrig solgte til.
      const forPris = Number(r.price);
      if (nu > 0 && nu !== forPris) {
        opd.last_change_at = new Date().toISOString();
        await supabase.from("price_events").insert({
          listing_id: r.id, kind: "aendret", price: nu, from_price: forPris,
          note: "rettet på Vinted",
        });
      }
      const foer = (r.published ?? {}) as Record<string, unknown>;
      const tekstRettet = snap && r.published
        ? (["title", "description"] as const).filter((k) =>
          snap[k] && !ensLyd(snap[k], foer[k]))
        : [];
      if (tekstRettet.length) {
        await supabase.from("price_events").insert({
          listing_id: r.id, kind: "rettet",
          note: "rettet på Vinted: " +
            tekstRettet.map((k) => k === "title" ? "titel" : "beskrivelse").join(", "),
        });
      }

      // Staar det, der ventede paa at komme ud, allerede i annoncen — fordi du
      // har skrevet det ind paa Vinted selv — er der intet at sende. Ellers
      // ville naeste tur forbi redigeringssiden skrive det samme ind igen.
      const p = r.pending as Record<string, unknown> | null;
      if (snap && p && Object.keys(p).length) {
        const rest: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p)) {
          const ude = snap[k];
          const passer = k === "price"
            ? Math.round(Number(ude)) === Math.round(Number(v))
            : ensLyd(ude, v);
          if (!passer) rest[k] = v;
        }
        if (Object.keys(rest).length !== Object.keys(p).length) {
          const tom = !Object.keys(rest).length;
          opd.pending = tom ? null : rest;
          if (tom) { opd.pending_note = null; opd.pending_since = null; }
        }
      }

      await supabase.from("listings").update(opd).eq("id", r.id);
      return json({ ok: true, published: snap });
    }

    if (body.mode === "watch") {
      const m = Array.isArray(body.maalinger) ? body.maalinger : [];
      try {
        return json(await tilsyn(m));
      } catch (err) {
        console.error("tilsyn failed", err);
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // AEndringerne er faktisk skrevet ind i annoncen — bekraeftet ved at laese
    // annoncen tilbage, ikke ved at have skrevet i et felt.
    if (body.mode === "anvendt") {
      const id = String(body.listing ?? "");
      if (!id) return json({ error: "mangler" }, 400);
      const { data: r } = await supabase.from("listings")
        .select("price, published").eq("id", id).maybeSingle();
      if (!r) return json({ error: "ukendt annonce" }, 404);

      const snap = renUdgivet(body.udgivet);
      const ny = Math.round(Number(body.price) || Number(snap?.price) || 0);
      const opd: Record<string, unknown> = {
        pending: null, pending_note: null, pending_since: null,
        synced_at: new Date().toISOString(),
      };
      if (snap) opd.published = snap;
      if (ny > 0) opd.price = ny;
      // last_change_at styrer, hvor laenge prisvagten holder sig i ro. Den maa
      // kun roeres, naar det var PRISEN, der blev aendret — en rettet titel
      // skal ikke udsaette naeste prisjustering.
      if (ny > 0 && ny !== Number(r.price)) opd.last_change_at = new Date().toISOString();
      await supabase.from("listings").update(opd).eq("id", id);

      const felter = Array.isArray(body.felter) ? body.felter as string[] : [];
      await supabase.from("price_events").insert({
        listing_id: id,
        kind: ny > 0 && ny !== Number(r.price) ? "aendret" : "rettet",
        price: ny > 0 ? ny : null,
        from_price: Number(r.price),
        note: "sat på Vinted" + (felter.length ? ": " + felter.join(", ") : ""),
      });
      return json({ ok: true });
    }

    if (!body.id) return json({ error: "missing_id" }, 400);

    // Telefonen sender de muligheder, Vinted faktisk viser, og faar et nummer
    // tilbage. Saa behoever ingen at gaette Vinteds ordlyd.
    // Faerdig: markeringen ryddes, saa et genindlaes ikke skriver den samme
    // annonce ind igen.
    // Annoncen er landet paa Vinted. Udkastet hoerer ikke laengere til i koen.
    if (body.mode === "posted") {
      // Foer flyttede dette udkastet direkte til "afsendt". Med tre
      // markedspladser er det forkert: at annoncen er landet paa Vinted siger
      // intet om DBA og Reshopper, og udkastet forsvandt ud af koeen, foer man
      // var faerdig med det. Nu noteres KUN Vinted som klaret; udkastet
      // forlader koeen, naar du selv siger til, eller naar alle tre er sat.
      //
      // Men foerst: ER det den annonce, du lige har lagt op? 2. oktober meldte
      // en anden fane nr. 10's sandaler som nr. 18 - telefonen tror den foerste
      // annonceside, den ser. En annonce, der hoerer til et andet udkast, eller
      // som er AELDRE end den nyeste, vi kender (Vinteds numre stiger), kan
      // ikke vaere den nye. Saa afvises den, og runneren venter paa den rigtige.
      if (body.item_id) {
        const nr = String(body.item_id);
        const { data: kendte } = await supabase.from("listings")
          .select("draft_id, external_id").eq("platform", "vinted");
        const sin = (kendte ?? []).find((l) => l.external_id === nr);
        if (sin && sin.draft_id !== body.id) {
          return json({ ok: false, afvist: "andet_udkast" });
        }
        const nyeste = Math.max(0, ...(kendte ?? []).map((l) => Number(l.external_id) || 0));
        if (!sin && Number(nr) <= nyeste) {
          return json({ ok: false, afvist: "aeldre_annonce" });
        }
      }
      const { data: nu } = await supabase
        .from("drafts").select("posted_to").eq("id", body.id).single();
      const sendt = { ...(nu?.posted_to ?? {}), vinted: new Date().toISOString() };
      const alle = ["vinted", "dba", "reshopper"].every((k) => sendt[k]);
      await supabase.from("drafts").update({
        posted_to: sendt,
        selected_at: null,
        ...(alle ? { status: "afsendt", posted_at: new Date().toISOString() } : {}),
      }).eq("id", body.id);
      // Herfra overtager prisvagten. Uden annoncens eget nummer kan den ikke
      // se varen igen, saa den registreres KUN naar telefonen kender det —
      // og det goer den, fordi den staar paa annoncens egen side.
      let vagt: string | null = null;
      if (body.item_id) {
        vagt = await registrer(
          String(body.id), "vinted", String(body.item_id),
          String(body.url ?? `https://www.vinted.dk/items/${body.item_id}`),
          Math.round(Number(body.price) || 0),
          body.udgivet,
        );
        // Fandtes annoncen i forvejen, opretter registrer() ingenting - men
        // teksten kan vaere rettet i formularen lige foer Upload, og saa er
        // DEN nyere end det, vi har staaende.
        if (vagt && body.udgivet) {
          await supabase.from("listings").update({
            published: renUdgivet(body.udgivet),
            synced_at: new Date().toISOString(),
          }).eq("id", vagt);
        }
      }
      return json({ ok: true, listing: vagt });
    }

    if (body.mode === "clear") {
      await supabase.from("drafts").update({ selected_at: null }).eq("id", body.id);
      return json({ ok: true });
    }

    if (body.mode === "market") {
      const { data: d, error: e } = await supabase
        .from("drafts")
        .select("title, description, brand, size, condition, material, color, photos, fakta")
        .eq("id", body.id)
        .single();
      if (e) return json({ error: e.message }, 500);
      // En ny vare skal prissaettes mod sin nypris. Fandt analysen den ikke,
      // proeves igen her - med det, der staar paa maerkerne. Fejler det, gaar
      // runden videre uden.
      const fakta = { ...((d.fakta ?? {}) as Fakta) };
      if (erNy(fakta, d.condition) && !(helKroner(fakta.nypris) > 0)) {
        try {
          const fundet = await slaaOp(ANTHROPIC_API_KEY, {
            brand: d.brand as string | null,
            productType: String(d.title ?? ""),
            color: String(d.color ?? ""),
            ny: true,
            maerker: fakta.maerker,
          });
          if (fundet.nypris) {
            fakta.ny = true;
            fakta.nypris = fundet.nypris;
            fakta.nyprisKilde = fundet.nyprisKilde;
            d.fakta = fakta;
            await supabase.from("drafts").update({ fakta }).eq("id", body.id);
          }
        } catch (err) {
          console.error("nypris i markedsrunden sprunget over", err);
        }
      }
      try {
        const out = await analyseMarket(
          d as Record<string, unknown>,
          Array.isArray(body.items) ? body.items as MarketItem[] : [],
          Array.isArray(body.samples) ? body.samples as Array<Record<string, never>> : [],
        );
        await supabase.from("drafts").update({
          title: out.title,
          description: out.description,
          price: String(out.price),
          price_note: out.priceNote,
          price_grounded: true,
        }).eq("id", body.id);
        return json({
          title: out.title,
          description: out.description,
          price: String(out.price),
          note: "pris sat mod " + out.compared + " sammenlignelige (median " + out.median + " kr)",
        });
      } catch (err) {
        console.error("market failed", err);
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
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
      result.price = vintedPristekst(result.price);
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
