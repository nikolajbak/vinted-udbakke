// Triggered by a Postgres webhook (see schema.sql / update_webhook.sql)
// whenever a new "afventer" draft is inserted. Analyzes the photo with
// Claude, grounds a price estimate in real Vinted listings, and writes
// the finished draft back to the row.

import { boerneStoerrelse, erBoernetoej, titelMedStoerrelse } from "../_shared/stoerrelse.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { searchWithFallback } from "./vinted.ts";
import { GUIDANCE_TOOL, optimizePhoto } from "./optimize.ts";
import { BESKRIVELSE_REGLER, type Fakta, faktaTekst, ingenVersaler, slaaOp, udenForbudte } from "../_shared/beskrivelse.ts";
import { hentErfaringer, hentRettelser } from "../_shared/laering.ts";
import { noterForbrug } from "../_shared/forbrug.ts";
import { helKroner, iNyprisRamme, NYPRIS_REGEL, nyprisRamme, prisTekst } from "../_shared/pris.ts";

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
  "tillidsvækkende og præcise beskrivelser i et positivt sprog, hvor en fejl kun nævnes, når den er sikker og til at se, " +
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
// Maerkerne laeses i et eget kald, med den store model og KUN maerkebillederne.
// Haiku midt i fem billeder laeste "TEF35" og "Atrm" to gange ud af tre, og
// kaldte en armygroen skjorte sandfarvet, selv naar den havde laest "Army".
// Sonnet paa maerkebillederne alene: rigtigt tre ud af tre, ~3 s (2. oktober).
// Fra 8. oktober ser kaldet ALLE billederne, ogsaa vaskemaerket: billeder fra
// Fotos fordeles paa trinene i raekkefoelge, saa et trin siger intet om, hvad
// billedet viser. Paa nr. 47 laa leggings under »Mærket«, og H&M-maerkatet
// under »Detalje« - kaldet fik kun leggingsbilledet at se.
const MAERKE_TOOL = {
  name: "maerker",
  description: "Det, der står på hængemærke, prismærke, nakkemærke og vaskemærke.",
  input_schema: {
    type: "object",
    properties: {
      tagText: {
        type: ["string", "null"],
        description:
          "Det, der kan finde netop denne vare i en butik: varenummer/style no., modelnavn (fx \"Linen Blend\"), " +
          "farvenavn og stregkode (EAN), afskrevet tegn for tegn. Ikke vaskeanvisning. null hvis intet kan læses.",
      },
      tagColor: { type: ["string", "null"], description: "Farvenavnet præcis som det står, fx \"Army\". null hvis der ikke står et." },
      farveDansk: { type: ["string", "null"], description: "Samme farve på dansk, fx \"armygrøn\". null hvis der ikke står en farve." },
      priceTag: { type: ["integer", "null"], description: "En trykt pris i danske kroner. null hvis der ikke står en." },
      materialer: {
        type: ["string", "null"],
        description:
          "Materialesammensætningen på dansk, præcis som vaskemærket angiver den, fx \"95% bomuld, 5% elastan\" " +
          "eller \"Yderstof: 100% polyester. For: 100% bomuld\". Står der flere dele (sæt), så skriv hvilken del. " +
          "null hvis intet vaskemærke kan læses.",
      },
      stoerrelse: {
        type: ["string", "null"],
        description: "Størrelsen som den står på mærkatet, fx \"EUR 128\" eller \"M\". null hvis den ikke kan læses.",
      },
      egenskaber: {
        type: ["string", "null"],
        description:
          "Andet, der står TYDELIGT på mærkerne og siger noget om varen: økologisk bomuld, GOTS, genanvendt, " +
          "vandsøjle, dun/fjer-fordeling, Gore-Tex o.l. Kort, på dansk. Ikke vaskeanvisning, ikke produktionsland. null ellers.",
      },
    },
    required: ["tagText", "tagColor", "farveDansk", "priceTag", "materialer", "stoerrelse", "egenskaber"],
  },
};

async function laesMaerker(urls: string[], draftId?: unknown): Promise<Record<string, unknown>> {
  if (!urls.length) return {};
  return await callClaudeJson(
    "Du afskriver mærker på tøj. Skriv kun det, der faktisk står — tegn for tegn. Gæt aldrig et tegn, du ikke kan læse. " +
      "Kun det, der står tydeligt og uomtvisteligt; et halvt læst ord er ikke læst.",
    [
      ...urls.map((url) => ({ type: "image", source: { type: "url", url } })),
      {
        type: "text",
        text: "Find alle mærker på billederne — hængemærke, prismærke, nakkemærke, størrelses- og vaskemærke — " +
          "og afskriv dem. Nogle billeder viser slet ikke et mærke; spring dem over.",
      },
    ],
    STRATEGY_MODEL,
    MAERKE_TOOL,
    800,
    draftId,
  );
}

async function callClaudeJson(
  system: string,
  userContent: unknown[],
  model: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  maxTokens = 1200,
  draftId?: unknown,
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
  await noterForbrug(data, `analyse:${tool.name}`, draftId);
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
      productType: {
        type: "string",
        description:
          "Den PRÆCISE varetype, ikke den almene. Skriv \"regnjakke\", \"termojakke\", \"skaljakke\", " +
          "\"flyverdragt\" eller \"softshelljakke\" frem for bare \"jakke\" — det er varetypen, der afgør, " +
          "hvilken kategori varen havner i på Vinted, og en forkert kategori koster salget. " +
          "Lad mærket og konstruktionen vejlede dig: forsvejsede sømme, gummieret eller blank belægning " +
          "og et mærke, der laver regntøj, betyder regntøj. Er det en lang trøje, der når ned over numsen, " +
          "er det en sweatkjole/tunika. Viser billederne flere ting, så skriv dem alle, fx \"sweatkjole og leggings (sæt)\".",
      },
      dele: {
        type: "array",
        items: { type: "string" },
        description:
          "HVER ting, billederne viser, som en del af det, der sælges — én linje pr. del med type, farve, mønster/tryk " +
          "og materiale, fx [\"mørkegrå sweatkjole med sort kat i plys\", \"leggings med leopardprint i camel og sort\"]. " +
          "Kig på ALLE billederne: ligger der to ting ved siden af hinanden, er det to dele. Underlaget (lagen, gulv) er ikke en del.",
      },
      brand: { type: ["string", "null"] },
      color: {
        type: "string",
        description:
          "Varens farve på dansk. Står der et farvenavn på hængemærke eller prismærke, er DET facit — " +
          "oversæt det (\"Army\" = armygrøn, \"Navy\" = marineblå, \"Sand\" = sandfarvet). Et foto kan " +
          "snyde på lys og hvidbalance; en armygrøn hørskjorte blev kaldt beige. Uden mærke: døm farven på " +
          "stoffet i jævnt lys, ikke i skygger eller refleks, og vær præcis (\"koksgrå\", \"camel\", \"støvet rosa\") — " +
          "ikke \"mørk\". Har varen et mønster, så nævn bundfarven og mønstrets farve.",
      },
      material: {
        type: ["string", "null"],
        description:
          "Materialet, som vaskemærket angiver det (\"95% bomuld, 5% elastan\"). Kan vaskemærket ikke læses, så " +
          "skriv kun et materiale, der er helt tydeligt (denim, strik, læder) — ellers null. Gæt ikke mellem bomuld og polyester.",
      },
      tilBoern: {
        type: "boolean",
        description: "true hvis varen er til et barn eller en baby (børnetøj, babytøj, børnesko) — døm på størrelsesmærket og snittet.",
      },
      size: {
        type: ["string", "null"],
        description:
          "Størrelsen. Er varen til et barn, er det BØRNESTØRRELSEN i cm (\"128\", \"158/164\", babytøj \"68\") — aldrig " +
          "voksenstørrelser som S/M/L. Står der et bogstav sammen med cm eller alder (\"L 147-158 cm\", \"M 11-12Y\"), så " +
          "skriv den øverste cm-værdi (\"158\") eller alderen omregnet (12 år = 152). Står der kun en alder (\"14\", \"6Y\"), " +
          "så omregn: 2 år = 92, 6 år = 116, 14 år = 164.",
      },
      condition: { type: "string" },
      visibleFlaws: {
        type: "string",
        description:
          "Kun fejl, du er HELT sikker på og som en køber ville se med det samme: et hul, en tydelig plet, " +
          "en ødelagt lynlås. Skygger, folder, krøl, lysrefleks, fnug fra underlaget og almindeligt " +
          "vaskepræg er ikke fejl. Skriv \"ingen\", hvis du er i tvivl — en opfundet fejl koster salget.",
      },
      priceTag: {
        type: ["integer", "null"],
        description: "Prisen i danske kroner, hvis et prismærke med pris kan læses på billederne. null ellers.",
      },
      measurements: {
        type: ["string", "null"],
        description:
          "Mål, der står trykt på et mærkat, fx \"W32 L34\", \"brystvidde 92 cm\" eller \"110/116 cm\". " +
          "Kun det, der faktisk kan læses. Størrelsen i andre landes system (\"EUR 128 US 7 UK 7-8Y\") er " +
          "ikke mål — nr. 47 fik den skrevet som mål. null ellers.",
      },
      category: { type: "string" },
      searchQuery: { type: "string", description: "Korte danske søgeord til at finde lignende varer på Vinted" },
    },
    required: ["productType", "dele", "color", "condition", "visibleFlaws", "category", "searchQuery"],
  },
};

// Vinteds farveliste har ingen nuancer. Analysen skriver »mørkegrå«, og
// faldt skrive-kaldet tilbage paa den, stod nr. 47 med en farve, Vinteds
// vaelger ikke kender. Saa lander farven altid paa listen - eller paa intet.
function vintedFarve(v: unknown): string | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  const direkte = VINTED_COLORS.find((c) => c.toLowerCase() === t);
  if (direkte) return direkte;
  const regler: Array<[RegExp, string]> = [
    [/flerfarve|multi|stribe|ternet|print|mønst/, "Flerfarvet"],
    [/marine|navy|mørkeblå/, "Marineblå"],
    [/lyseblå|isblå|babyblå|himmelblå/, "Lyseblå"],
    [/turkis|petrol|aqua/, "Turkis"],
    [/mint/, "Mintgrøn"],
    [/army|oliven|khaki/, "Khaki"],
    [/mørkegrøn|flaskegrøn|skovgrøn/, "Mørkegrøn"],
    [/grøn/, "Grøn"],
    [/bordeaux|bourgogne|vinrød/, "Bourgogne"],
    [/koral/, "Koral"],
    [/abrikos|fersken/, "Abrikos"],
    [/sennep|okker/, "Sennepsgul"],
    [/gul/, "Gul"],
    [/orange/, "Orange"],
    [/lyserød|pink/, "Lyserød"],
    [/rosa|støvet rosa|gammelrosa/, "Rosa"],
    [/lyslilla|lavendel/, "Lyslilla"],
    [/lilla|violet|aubergine/, "Lilla"],
    [/rød/, "Rød"],
    [/creme|fløde|offwhite|off-white|ecru|elfenben/, "Flødefarvet"],
    [/beige|sand|camel|nougat|taupe/, "Beige"],
    [/brun|cognac|chokolade|kaffe/, "Brun"],
    [/sølv/, "Sølv"],
    [/guld/, "Guld"],
    [/grå|koks|antracit|grafit|melange/, "Grå"],
    [/sort/, "Sort"],
    [/hvid/, "Hvid"],
    [/blå|denim|kobolt/, "Blå"],
  ];
  for (const [re, c] of regler) if (re.test(t)) return c;
  return null;
}

// Vinteds materialefelt tager ét ord. Vaskemaerkets »95% bomuld, 5% elastan«
// bliver til det, der er mest af: »Bomuld«.
function hovedMateriale(v: unknown): string | null {
  const t = cleanText(v);
  if (!t) return null;
  let bedst = "", maks = -1;
  for (const m of t.matchAll(/(\d{1,3})\s*%\s*([\p{L}-]+)/gu)) {
    if (Number(m[1]) > maks) { maks = Number(m[1]); bedst = m[2]; }
  }
  const ord = bedst || (t.match(/^[\p{L}-]+/u)?.[0] ?? "");
  return ord ? ord.charAt(0).toLocaleUpperCase("da-DK") + ord.slice(1).toLocaleLowerCase("da-DK") : null;
}

// En instruktion om at give luft er ikke det samme som luft. Modellen ser
// derfor sit eget resultat: er motivet klemt op ad kanten, eller er der skaaret
// noget vaesentligt fra? Saa gaas et skridt tilbage. Det er samme greb som ved
// rotation og maskering, og begge steder fangede det fejl, instruktionen alene
// ikke kunne.
const CHECK_TOOL = {
  name: "tjek_billede",
  description: "Sig om billedet vender rigtigt, og om beskæringen er uheldig.",
  input_schema: {
    type: "object",
    properties: {
      missingDegrees: {
        type: "integer",
        enum: [0, 90, 180, 270],
        description: "Hvor mange grader MED URET billedet mangler at blive drejet. 0 hvis det allerede vender rigtigt.",
      },
      // Et ja/nej om retning er for nemt at svare 0 paa. Produkt 8's
      // forfra-billede kom ud paa hovedet, og kontrollen sagde god for det.
      // Peger den i stedet paa kraven, kan den ikke svare uden at se efter -
      // og graderne regnes i koden, hvor de ikke kan blive gaettet forkert.
      varensTop: {
        type: "string",
        enum: ["oeverst", "nederst", "venstre", "hoejre", "ikke_toej"],
        description:
          "Er varen et toejstykke: hvor i BILLEDET ligger den ende, der baeres oeverst " +
          "— krave, halsaabning, skulderlinje, linning paa bukser? Aermer og ben siger " +
          "intet. Er motivet ikke et toejstykke (et maerkat, et logo, en detalje), svar " +
          "\"ikke_toej\".",
      },
      tooTight: {
        type: "boolean",
        description:
          "true hvis motivet er klemt op ad en kant uden luft omkring sig, eller hvis noget " +
          "væsentligt — tekst, et logo, en del af varen — er skåret væk af beskæringen. " +
          "false hvis billedet ser bevidst ud.",
      },
      why: { type: "string", description: "Meget kort, kun hvis true" },
    },
    required: ["missingDegrees", "tooTight", "varensTop"],
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
          "Vejen ned gennem Vinteds danske kategoritræ, fra øverste niveau til det mest præcise underpunkt. " +
          "Har varetypen sin egen gren — regntøj, termotøj, skitøj — så brug den frem for den almene " +
          "jakke-gren. Skal der vælges mellem pige- og drengetøj, så døm efter varens eget udtryk " +
          "(snit, farve, tryk, detaljer). Er den helt neutral, så vælg den gren, hvor flest købere " +
          "ville lede efter netop dén vare. " +
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
      material: {
        type: ["string", "null"],
        description:
          'Hovedmaterialet med Vinteds danske ord, fx "Bomuld", "Polyester", "Uld", "Læder", "Denim". ' +
          "Står der flere på vaskemærket, vælges det, der fylder mest. null hvis materialet ikke kan læses.",
      },
      condition: {
        type: "string",
        enum: VINTED_CONDITIONS,
        description:
          "Standen, valgt fra Vinteds fem faste muligheder. Mål efter Vinteds egne ord, ikke efter " +
          "et skøn:\n" +
          '"Ny med prismærker" = ubrugt, prismærket sidder på.\n' +
          '"Ny uden prismærker" = ubrugt, men uden mærke.\n' +
          '"Meget god" = let brugt, højst små fejl man skal lede efter.\n' +
          '"God" = brugt, med synlige tegn på slid.\n' +
          '"Tilfredsstillende" = tydeligt brugt, med pletter, huller, misfarvning eller nullermænd, ' +
          "der kan ses på billederne.\n" +
          "Er der en plet, et hul eller en misfarvning, du er HELT sikker på, så er standen højst " +
          '"Tilfredsstillende". Skygger, folder, krøl og lysrefleks er ikke fejl og trækker ikke ned. ' +
          "Er du i tvivl, så døm efter helhedsindtrykket — en opfundet fejl koster salget lige så sikkert " +
          "som en skjult.",
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
  // Sat, naar kaldet gaelder ét bestemt foto.
  let only: number | null = null;
  try {
    const body = await req.json();
    id = body.id;
    only = typeof body.photo === "number" ? body.photo : null;
    if (!id) throw new Error("missing id");
  } catch (e) {
    return new Response(`bad_request: ${e}`, { status: 400 });
  }

  // Ét tal i loggen pr. annonce. Nok til at se, om noget er ved at skride,
  // uden at fylde loggen med mellemregninger.
  const t0 = Date.now();

  try {
    const { data: row, error: rowErr } = await supabase
      .from("drafts")
      .select("photos, image_url, tone, pad_style, ratio")
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

    // Hvert foto faar sin egen invokation. Supabase maaler CPU pr. kald, og ét
    // foto paa 1800x1350 fylder en maerkbar del af budgettet - fem i samme kald
    // sprang det, og analysen blev haengende uden nogensinde at fejle synligt.
    // Sekventielt, saa skrivningerne til photos-listen ikke kan traede paa
    // hinanden.
    let personalInfoSeen = false;

    // Seriens fremkaldelse: maalt paa det foerste billede, genbrugt paa resten.
    // Ellers faar den samme jakke forskellig farve fra billede til billede, alt
    // efter hvor meget gulv der er med i rammen. Erklaeret her, ikke inde i
    // loekken - den skal ogsaa kunne laeses, naar billedet gemmes bagefter.
    // En tone fra foer v2 er maalt paa det hvidt indrammede billede og gjorde
    // varen moerkere. Den regnes som ingen, saa foto 0 maaler og gemmer på ny.
    const gemt = (row?.tone ?? undefined) as Tone | undefined;
    const tone = gemt && gemt.v === 2 ? gemt : undefined;
    const toneOut: { tone?: Tone } = {};
    // Formatet deles som fremkaldelsen: maalt paa foto 0, genbrugt af resten.
    const seriesRatio = Number(row?.ratio) || undefined;
    const ratioOut: { ratio?: number } = {};

    if (only === null) {
      // Samtidigt, ikke i koe. Fem kald i traek tog laengere end Supabase lader
      // ét kald vare, saa billederne blev faerdige mens selve analysen aldrig
      // naaede i mål. Hvert delkald har sit eget CPU-budget, saa de kan lige
      // saa godt loebe ved siden af hinanden.
      const kald = async (i: number) => {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/analyze-draft`, {
            method: "POST",
            headers: { "x-webhook-secret": WEBHOOK_SECRET, "content-type": "application/json" },
            body: JSON.stringify({ id, photo: i }),
          });
          if (!r.ok) {
            console.error("foto", i, "fejlede:", (await r.text()).slice(0, 200));
            return false;
          }
          return (await r.json())?.personal === true;
        } catch (err) {
          console.error("foto", i, err);
          return false;
        }
      };
      // Foerste billede alene: det maaler seriens fremkaldelse, som resten
      // henter. Derefter loeber de oevrige ved siden af hinanden.
      const first = photos.length ? await kald(0) : false;
      const rest = await Promise.all(photos.slice(1).map((_p, i) => kald(i + 1)));
      personalInfoSeen = [first, ...rest].some(Boolean);

      const { data: fresh } = await supabase.from("drafts").select("photos").eq("id", id).single();
      if (Array.isArray(fresh?.photos) && fresh.photos.length) {
        photos.splice(0, photos.length, ...(fresh.photos as Photo[]));
      }
      // Forsidebilledet og personflaget saettes her, én gang, naar alle er inde.
      await supabase.from("drafts").update({
        image_path: photos[0]?.path,
        image_url: photos[0]?.url,
        personal_info: personalInfoSeen,
      }).eq("id", id);
    }

    const wanted = only === null ? photos : (photos[only] ? [photos[only]] : []);
    if (!wanted.length) throw new Error("photo_index_out_of_range");

    // Kun delkaldet har brug for selve bytes - det skal behandle billedet.
    // Orkestreringen noejes med adresserne og lader modellen hente dem.
    const loaded: Array<{ photo: Photo; buf: ArrayBuffer; mediaType: string }> = [];
    for (const photo of wanted) {
      if (only === null) {
        loaded.push({ photo, buf: new ArrayBuffer(0), mediaType: "image/jpeg" });
        continue;
      }
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
    for (const l of (only === null ? [] : loaded)) {
      if (!l.photo.path) continue;
      if (l.photo.optimized || /-opt\.jpg$/i.test(l.photo.path)) continue;
      try {
        const g = await callClaudeJson(
          "Du er fotograf og forbereder ét foto til en Vinted-annonce.\n\n" +
            "1) Rotation: hvor mange grader MED URET skal billedet drejes (0/90/180/270)?\n" +
            "Spoergsmaalet er IKKE, hvad der vendte opad da fotoet blev taget - telefonen kan\n" +
            "have vaeret holdt paa hoejkant, paa skraa eller paa hovedet, og det siger intet om\n" +
            "varen. Spoergsmaalet er, hvilken af de fire drejninger der viser VAREN bedst, som\n" +
            "den ville blive vist i en butik: en overdel med skuldre og krave oeverst, bukser med\n" +
            "linningen oeverst, sko staaende paa saalen. Er der TEKST i billedet - maerkat,\n" +
            "vaskeanvisning, logo, tryk - afgoer laeseretningen det: teksten skal kunne laeses\n" +
            "vandret fra venstre mod hoejre. Ligger varen loest uden en oplagt top og bund, saa\n" +
            "vaelg den drejning, der giver den roligste og mest genkendelige silhuet.\n" +
            "2) Motivet: hvad handler billedet om — hele varen, et maerkat med tekst, et logo, " +
            "en detalje som en lynlaas eller en knap, eller et slidmaerke? Det afgoer, hvordan der " +
            "beskaeres, saa vaelg det praecist.\n" +
            "2b) Kassen: angiv MOTIVETS yderste kanter i normaliserede koordinater 0-1. " +
            "Er billedet et NAERBILLEDE af et maerkat, et logo, et tryk eller en detalje, skal kassen " +
            "slutte om selve maerkatet/logoet/detaljen — ikke om hele toejstykket omkring det. " +
            "Er billedet en HEL vare, skal kassen foelge varens kanter og holde gulv, borde, " +
            "foedder, ben, haender og moebler udenfor.\n" +
            "Taenk som en art director: du saetter ikke bare en kasse om noget, du bestemmer hvad " +
            "billedet SKAL vise. Det afgoerende er, at INTET vaesentligt gaar tabt: hele varen, " +
            "hele maerkatet, hver linje tekst. Er der to maerkater ved siden af hinanden - fx en " +
            "lille stoerrelseslap og en stor vaskeanvisning - skal kassen rumme dem BEGGE, for " +
            "begge dele er oplysninger, koeberen skal kunne laese.\n" +
            "Rummelighed gaelder TEKST OG DETALJER, ikke hele varer. Ved et maerkat, et logo " +
            "eller en detalje: hellere en kasse, der er lidt for rummelig, end en der klipper " +
            "den sidste linje af. Ved en HEL vare er det modsatte rigtigt: kassen skal foelge " +
            "varens egen yderkant - aermespids til aermespids, krave til soem - og ikke en " +
            "haandsbredde af det, varen ligger paa. Luften laegges til bagefter. En kasse, der " +
            "er rundhaandet her, ender som et billede, hvor varen fylder halvdelen og resten er " +
            "sengetoej.\n" +
            "En tekst eller et logo skal staa helt inde i rammen med luft omkring sig — klistret " +
            "op ad kanten laeser det som en fejl, ogsaa naar teksten er hel. " +
            "Luften laegges til automatisk bagefter, saa saet kassen taet om motivet selv.\n" +
            "2b-2) backgroundClutter: er der forstyrrende baggrund TAET paa varen, som ikke kan\n" +
            "beskaeres vaek uden at skaere i varen selv - fotografens foedder eller ben, en haand,\n" +
            "en sengekant, en bordkant, et moebel, andet toej? Svar true. Er baggrunden rolig og\n" +
            "ensartet, svar false. Ved true beskaeres der stramt om varen, og resten fyldes ud i\n" +
            "baggrundens egen farve, saa varen staar isoleret som paa et produktfoto.\n" +
            "2c) subjectCutOff: er en del af motivet allerede UDEN FOR billedets kant i originalen — " +
            "fx et logo, hvor de sidste bogstaver mangler? Det kan ikke laves om ved beskaering, men " +
            "rammen bliver saa lagt bredere, saa det afskaarne ikke springer i oejnene. " +
            "Svar kun true, naar noget faktisk er klippet af kanten.\n" +
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
            "Farverne roeres ikke: hvidbalancen maales af billedet selv, og varen skal have sin " +
            "rigtige farve. Er billedet allerede godt, saa svar 0 - overdriv ikke.",
          [
            { type: "image", source: { type: "url", url: l.photo.url } },
            { type: "text", text: `Billedtype: ${l.photo.kind || "ukendt"}. Vurdér dette ene billede.` },
          ],
          STRATEGY_MODEL,
          GUIDANCE_TOOL,
          400,
          id,
        );

        const regions = Array.isArray(g.personalRegions) ? g.personalRegions : [];
        const guards = Array.isArray(g.protectRegions) ? g.protectRegions : [];
        if (regions.length) personalInfoSeen = true;
        const toBox = function (r: Record<string, number>) {
          return { x0: Number(r.x0), y0: Number(r.y0), x1: Number(r.x1), y1: Number(r.y1) };
        };

        const frame = {
          subject: cleanText(g.subject) || undefined,
          subjectCutOff: g.subjectCutOff === true,
          backgroundClutter: g.backgroundClutter === true,
          padStyle: (row?.pad_style as string) || "hvid",
        };
        const look = {
          exposure: Number(g.exposure) || 0,
          contrast: Number(g.contrast) || 0,
        };
        const box = { x0: Number(g.x0), y0: Number(g.y0), x1: Number(g.x1), y1: Number(g.y1) };
        let rotation = Number(g.rotationDegrees) || 0;

        // Ét fuldt gennemløb. Afkodningen af originalen er det dyre trin, så
        // den sker én gang — et separat kontrolbillede kostede en afkodning
        // mere pr. foto og sprængte Supabases CPU-grænse.
        let jpeg = await optimizePhoto(l.buf, {
          ...frame, rotationDegrees: rotation, crop: box, tone, toneOut, seriesRatio, ratioOut,
          mask: regions.map(toBox), protect: guards.map(toBox), look,
        });

        // Retning og beskæring bedømmes på dét, vi allerede har liggende.
        // Selve kontrollen koster ingen CPU, kun et kald; og et nyt gennemløb
        // betales kun, når der faktisk er noget galt.
        try {
          const check = await callClaudeJson(
            "Du er art director og ser på ét foto, der er gjort klar til en Vinted-annonce.\n" +
              "1) Vender varen rigtigt? Er motivet et tøjstykke, så sig hvor i billedet den ende " +
              "ligger, der bæres øverst — krave, halsåbning, skulderlinje, eller linningen på " +
              "bukser. Ærmer og ben siger intet om retningen. Sko vender rigtigt med sålen " +
              "nedad, et mærkat når teksten kan læses vandret. Svar kun 0 grader, hvis " +
              "billedet faktisk vender rigtigt — ikke som en måde at slippe uden om.\n" +
              "2) Er motivet klemt op ad en kant uden luft omkring sig, eller er noget væsentligt " +
              "skåret væk af RAMMEN? Et mærkat eller et logo skal have luft hele vejen rundt. " +
              "Var motivet allerede skåret af, da billedet blev taget, er det ikke rammens skyld.",
            [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(jpeg.buffer as ArrayBuffer) } },
            ],
            STRATEGY_MODEL,
            CHECK_TOOL,
            250,
            id,
          );
          // Kravens plads vejer tungere end et tal, modellen selv skulle regne
          // ud. Er den kendt, bestemmer den; ellers falder vi tilbage.
          const TOP_TIL_GRADER: Record<string, number> = {
            oeverst: 0, nederst: 180, venstre: 90, hoejre: 270,
          };
          const fraTop = TOP_TIL_GRADER[String(check.varensTop ?? "")];
          const missing = fraTop === undefined ? (Number(check.missingDegrees) || 0) : fraTop;
          const spin = (missing === 90 || missing === 180 || missing === 270);
          const tight = check.tooTight === true;
          if (spin || tight) {
            if (spin) rotation = (rotation + missing) % 360;
            jpeg = await optimizePhoto(l.buf, {
              ...frame, subjectCutOff: tight || frame.subjectCutOff,
              rotationDegrees: rotation, crop: box, tone: tone ?? toneOut.tone,
              seriesRatio: seriesRatio ?? ratioOut.ratio, ratioOut,
              mask: regions.map(toBox), protect: guards.map(toBox), look,
            });
          }
        } catch (err) {
          console.error("billedtjek fejlede", err);
        }

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
              id,
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
        // Filen skrives til den SAMME sti hver gang (upsert), saa baade Safari
        // og Supabases CDN ville blive ved med at vise den kopi, de allerede
        // har. Et stempel i adressen goer den til en ny adresse, og saa hentes
        // billedet forfra. Uden det ligner en rettet billedbehandling, at intet
        // er sket.
        const stempel = Date.now().toString(36);
        const raa = supabase.storage.from("photos").getPublicUrl(optPath).data.publicUrl;
        l.photo.url = raa + (raa.includes("?") ? "&" : "?") + "v=" + stempel;
        l.photo.optimized = true;
        l.buf = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer;
        l.mediaType = "image/jpeg";
      } catch (err) {
        console.error("optimering sprunget over for", l.photo.kind, err);
      }
    }

    // Delkaldet skriver sit ene foto tilbage i listen og stopper her.
    if (only !== null) {
      if (loaded[0].photo.optimized) {
        await supabase.rpc("set_draft_photo", {
          p_id: id, p_index: only, p_photo: loaded[0].photo,
        });
        // Foerste billede laegger fremkaldelsen OG formatet frem til resten af
        // serien. Begge dele maales paa hovedbilledet, saa annoncen staar ens.
        const felter: Record<string, unknown> = {};
        if (only === 0 && !tone && toneOut.tone) felter.tone = toneOut.tone;
        if (only === 0 && !seriesRatio && ratioOut.ratio) felter.ratio = ratioOut.ratio;
        if (Object.keys(felter).length) {
          await supabase.from("drafts").update(felter).eq("id", id);
        }
      }
      return new Response(JSON.stringify({ ok: true, personal: personalInfoSeen }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Cap what we send onward: the first few carry almost all the signal.
    const imageBlocks: unknown[] = [];
    for (const l of loaded.slice(0, 5)) {
      // Naming the shot lets the model read a blurry label photo for what it
      // is instead of guessing at a mystery close-up.
      // Trinnet er kun en hensigt: billeder fra Fotos fordeles paa trinene i
      // raekkefoelge (nr. 47: leggings under »Mærket«).
      imageBlocks.push({ type: "text", text: `Billede ${imageBlocks.length / 2 + 1} (taget som »${l.photo.kind || "ukendt"}« — se selv efter, hvad det viser):` });
      imageBlocks.push({
        type: "image",
        // URL frem for base64: billedet ligger i forvejen offentligt, og at
        // pakke 5 x en halv megabyte om til base64 og sende det med kostede
        // baade CPU og det meste af ventetiden.
        source: { type: "url", url: l.photo.url },
      });
    }

    // Maerkerne side om side med billedanalysen. Fejler det, gaar analysen
    // videre uden.
    const maerkerP = laesMaerker(loaded.slice(0, 6).map((l) => String(l.photo.url)), id).catch((err) => { console.error("maerkerne kunne ikke laeses", err); return {} as Record<string, unknown>; });

    // Det, analysen tidligere har taget fejl af (dine rettelser, Vinteds afvisninger).
    const rettelser = await hentRettelser();

    // 1. Vision: identify the product from the photo, as an expert seller would size it up.
    // Den store model fra 8. oktober: Haiku beskrev kun trøjen paa nr. 47, hvor
    // billedet viste en sweatkjole OG et par leggings, og kaldte farven »mørkegrå«.
    const vision = await callClaudeJson(
      SELLER_PERSONA + " Du kigger på ALLE fotos af det, kunden vil sælge, og vurderer det, som du ville gøre " +
        "før du selv lagde det til salg. Gennemgå hvert billede for sig, og registrér ALT, der sælges: viser billederne " +
        "to eller flere ting (fx en kjole og et par bukser), er det et sæt, og hver del skal med. " +
        "Mærke-, størrelses- og vaskemærkerne er dine primære kilder til mærke, størrelse og materiale — læs dem, i stedet " +
        "for at gætte ud fra formen. Udled alt, der TYDELIGT og uomtvisteligt står på mærkerne. Er noget ikke læsbart, så " +
        "lad feltet være tomt frem for at finde på det. condition skal være en af: ny med mærke, ny uden mærke, god, brugt, slidt." +
        (rettelser ? "\n\n" + rettelser : ""),
      [
        ...imageBlocks,
        { type: "text", text: "Analysér alle billederne. Hvad sælges — alle dele?" },
      ],
      STRATEGY_MODEL,
      VISION_TOOL,
      1600,
      id,
    );
    const searchQuery = String(vision.searchQuery || vision.productType || "genbrug");

    // Nypris og maal. Prismaerket og mærkatet er de sikre kilder; nettet bruges
    // kun til det, billederne ikke selv kan svare paa.
    const ny = /^ny/i.test(String(vision.condition ?? "").trim());
    const fakta: Fakta = {};
    if (ny) fakta.ny = true;
    const lm = await maerkerP;
    const tom = (v: unknown) => { const s = cleanText(v); return s && !/^(null|ingen|-)$/i.test(s) ? s : ""; };
    const tagPris = Math.round(Number(lm.priceTag)) || Math.round(Number(vision.priceTag));
    if (ny && tagPris > 0) { fakta.nypris = tagPris; fakta.nyprisKilde = "prismærket"; }
    const maerker = tom(lm.tagText);
    if (maerker) fakta.maerker = maerker.replace(/\s*\n\s*/g, ", ").slice(0, 300);
    // Farvenavnet paa maerket er facit for farven (bestemt af dig 2. oktober).
    const tagFarve = tom(lm.tagColor), farveDansk = tom(lm.farveDansk);
    if (tagFarve) {
      fakta.maerkeFarve = (farveDansk && farveDansk.toLowerCase() !== tagFarve.toLowerCase()
        ? `${tagFarve} (${farveDansk})` : tagFarve).slice(0, 60);
      vision.color = farveDansk || tagFarve;
    }
    // Et maal har cm, W/L eller et maalord. »EUR 128 US 7 CN 130/59 UK 7-8Y« er
    // stoerrelsen i andre landes system - nr. 47 fik den som maal to gange i
    // traek, ogsaa efter prompten sagde fra.
    const maalTekst = cleanText(vision.measurements);
    if (/\d\s*cm\b|\bW\s?\d{2}\b.*\bL\s?\d{2}\b|vidde|længde|bredde|højde/i.test(maalTekst)) {
      fakta.maal = maalTekst; fakta.maalKilde = "mærkatet";
    }
    // Vaskemaerket er facit for materialet; et foto kan ikke se forskel paa
    // bomuld og viskose.
    const materialer = tom(lm.materialer);
    if (materialer) { fakta.materialer = materialer.slice(0, 200); vision.material = materialer; }
    const egenskaber = tom(lm.egenskaber);
    if (egenskaber) fakta.egenskaber = egenskaber.slice(0, 200);
    if (!tom(vision.size) && tom(lm.stoerrelse)) vision.size = tom(lm.stoerrelse);
    // Boernetoej faar boernestoerrelsen i cm, ogsaa naar maerket siger »L« (_shared/stoerrelse.ts).
    if (vision.tilBoern === true && !/sko|støvle|sandal|sneaker/i.test(String(vision.productType ?? ""))) {
      vision.size = boerneStoerrelse(vision.size, lm.stoerrelse, vision.measurements, lm.tagText) || vision.size;
    }
    const dele = (Array.isArray(vision.dele) ? vision.dele : []).map((x) => cleanText(x)).filter(Boolean);
    if (dele.length > 1) fakta.dele = dele.slice(0, 6);
    const flaws = cleanText(vision.visibleFlaws);
    if (flaws && !/^(ingen|nej|-|none)\b/i.test(flaws)) fakta.fejl = flaws;
    // Opslaget tager ~20 s, saa det koerer side om side med markedssoegningen.
    const opslag = slaaOp(ANTHROPIC_API_KEY, {
      brand: vision.brand as string | null,
      productType: String(vision.productType ?? ""),
      size: fakta.maal ? null : vision.size as string | null,
      color: String(vision.color ?? ""),
      ny: ny && !fakta.nypris,
      maerker: fakta.maerker,
    }, id).then((fundet) => {
      if (fundet.nypris) { fakta.nypris = fundet.nypris; fakta.nyprisKilde = fundet.nyprisKilde; }
      if (fundet.maal) { fakta.maal = fundet.maal; fakta.maalKilde = "mærkets størrelsesguide"; }
      // Plaggets egne maal til Vinteds felter - kun naar varens produktside
      // opgiver dem. Et saet har ingen samlet laengde.
      if (!fakta.dele && (fundet.laengde || fundet.skulderbredde)) {
        if (fundet.laengde) fakta.laengde = fundet.laengde;
        if (fundet.skulderbredde) fakta.skulderbredde = fundet.skulderbredde;
        fakta.plagMaalKilde = "mærkets produktside";
      }
    }).catch((err) => console.error("opslag af nypris/maal sprunget over", err));

    // 2. Try to ground pricing here, but don't lean on it: Vinted blocks
    // datacenter IPs intermittently. When this fails the phone does the
    // lookup instead (same-origin from vinted.dk, never blocked) — see
    // vinted-fill-script. One quick attempt only, so a blocked call doesn't
    // hold the draft up.
    const erfaringerP = hentErfaringer(["tekst", "pris"]);
    const { items, country, blocked } = await searchWithFallback(searchQuery, "dk", "fr", 12, 1);
    await opslag;
    const erfaringer = await erfaringerP;
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
        "Beskrivelse: 4-7 linjer om mærke, størrelse, materiale og stand.\n" + BESKRIVELSE_REGLER + "\n" +
        (erfaringer ? erfaringer + "\n" : "") +
        (rettelser ? rettelser + "\n" : "") +
        "Sælges flere dele samlet (se Fakta), så nævn dem alle i titlen (\"H&M sweatkjole og leggings str. 128\"), " +
        "og vælg en kategori for sæt, hvis Vinted har en — ellers hoveddelens. color er den farve, der fylder mest; " +
        "material er det, vaskemærket angiver mest af, med Vinteds ord.\n" +
        "Pris: et konkret beløb i kr, sat som en reel salgsstrategi (se markedsdata), ikke bare et gennemsnit. " +
        NYPRIS_REGEL + " " +
        "Udfyld desuden Vinteds egne felter — categoryPath, brand, size, sizeScale, color, condition — med Vinteds " +
        "egen danske ordlyd, for de bliver klikket direkte ind i formularen. Er du i tvivl om mærke eller størrelse, " +
        "så skriv null i stedet for at gætte; et forkert mærke er værre end et tomt felt.",
      [
        {
          type: "text",
          text: `Produktanalyse fra billederne: ${JSON.stringify(vision)}\n\n${faktaTekst(fakta)}\n\n${marketContext}`,
        },
      ],
      STRATEGY_MODEL,
      DRAFT_TOOL,
      1600,
      id,
    );

console.log("annonce klar paa", Date.now() - t0, "ms");
    draft.description = await udenForbudte(ANTHROPIC_API_KEY, cleanText(draft.description), id);
    // En ny vare med kendt nypris lægges inden for rammen (_shared/pris.ts).
    const ramme = iNyprisRamme(helKroner(cleanText(draft.price)), nyprisRamme(fakta, draft.condition));
    if (ramme.note) {
      draft.price = String(ramme.pris);
      draft.priceNote = cleanText(draft.priceNote) + ` (${ramme.note})`;
    }
    // Skrive-kaldet kan stadig falde tilbage paa et bogstav; boernetoej rettes efter det.
    const foerStr = cleanText(draft.size || vision.size);
    let slutStr = foerStr;
    if (erBoernetoej(draft.categoryPath, String(vision.productType ?? ""))) {
      slutStr = boerneStoerrelse(foerStr, vision.size, lm.stoerrelse, vision.measurements, fakta.maal, draft.title);
      if (slutStr !== foerStr) {
        console.log("boernestoerrelse", foerStr, "->", slutStr);
        draft.title = titelMedStoerrelse(cleanText(draft.title), foerStr, slutStr);
        draft.sizeScale = "EU";
      }
    }
    const { error } = await supabase
      .from("drafts")
      .update({
        status: "ny",
        title: ingenVersaler(cleanText(draft.title), cleanText(draft.brand || vision.brand)),
        description: cleanText(draft.description),
        category: cleanText(draft.category),
        condition: cleanText(draft.condition),
        price: prisTekst(cleanText(draft.price)),
        price_note: cleanText(draft.priceNote),
        search_query: searchQuery,
        price_grounded: grounded,
        fakta,
        // Vinteds egne felter. Bogmaerket klikker dem igennem, saa de gemmes
        // her praecis som modellen formulerede dem. draft vinder over vision:
        // draft-kaldet kender Vinteds ordlyd, vision-kaldet laeser bare etiketten.
        brand: cleanText(draft.brand || vision.brand) || null,
        size: slutStr || null,
        size_scale: cleanText(draft.sizeScale) || null,
        color: vintedFarve(draft.color) || vintedFarve(vision.color),
        material: cleanText(draft.material) || hovedMateriale(vision.material),
        category_path: Array.isArray(draft.categoryPath) && draft.categoryPath.length
          ? draft.categoryPath.map((c: unknown) => cleanText(c)).filter(Boolean)
          : null,
      })
      .eq("id", id);

    if (error) throw new Error(`db_update_failed: ${error.message}`);

    // Sig til paa telefonen at udkastet er klar. Fire-and-forget: en push, der
    // fejler, maa aldrig vaelte analysen, der lige lykkedes.
    try {
      const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
      if (webhookSecret) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/push-send`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-webhook-secret": webhookSecret },
          body: JSON.stringify({
            title: "Udkast klar",
            body: cleanText(draft.title) || "Et nyt udkast er klar til at blive lagt op.",
            url: "/vinted-udbakke/",
          }),
        }).catch(() => {});
      }
    } catch (_e) { /* push er en ekstra, ikke en betingelse */ }

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
