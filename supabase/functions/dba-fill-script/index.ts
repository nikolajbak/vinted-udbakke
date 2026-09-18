// Serveren bag DBA-automatikken.
//
// Den er med vilje tyndere end Vinteds. Prisen er allerede jordet dengang
// annoncen blev lagt på Vinted, og DBA blokerer ikke serverkald, så der er
// hverken markedsopslag eller kontrolrunde her — kun to ting, telefonen ikke
// selv kan: at oversætte til DBA's egen ordlyd, og at rydde markeringen.

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
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

function clean(v: unknown): string {
  return String(v ?? "").replace(/<[^>]*>/g, "").trim();
}
function plainPrice(p: string): string {
  const n = String(p ?? "").replace(/[^\d]/g, "");
  return n || "";
}

const CHOICE_TOOL = {
  name: "vaelg_mulighed",
  description: "Vælg den mulighed, der passer bedst til varen.",
  input_schema: {
    type: "object",
    properties: {
      index: { type: "integer", description: "Nummeret på den bedste mulighed. -1 hvis ingen passer." },
      reason: { type: "string", description: "Meget kort begrundelse" },
    },
    required: ["index"],
  },
};

// DBA's ordlyd er deres egen. Ingen model gaetter "Brugt - men i god stand"
// eller "Tøjpakker" ud af den blaa luft, saa telefonen sender de punkter, der
// staar paa skaermen, og faar et nummer tilbage.
const INTRO: Record<string, string> = {
  kategori:
    "Du står i DBA's kategorivælger og skal vælge ét niveau. Vælg altid et punkt, hvis bare ét af " +
    "dem kan rumme varen — en lidt bred, men rigtig kategori er langt bedre end ingen. " +
    "Svar kun -1, hvis absolut intet punkt kan rumme varen.",
  stand:
    "Du står i DBA's stand-vælger. Døm varens stand ud fra beskrivelsen. " +
    'Er der nævnt en plet, et hul eller slid, er det aldrig "Som ny".',
  farve: "Vælg den farve, der bedst dækker varen. Er varen flerfarvet, så vælg Multifarvet.",
  "køn": "Vælg om varen er til en dreng, en pige, eller er neutral (Unisex). Er du i tvivl, vælg Unisex.",
  pasform: 'Vælg hvordan varen falder i størrelsen. Står der intet om det, er svaret "Normal i størrelsen".',
};

async function chooseOption(
  draft: Record<string, unknown>,
  kind: string,
  chosen: string[],
  options: string[],
  hint?: string,
): Promise<number> {
  const list = options.map((o, i) => `${i}: ${o}`).join("\n");
  const where = chosen.length ? `Valgt indtil nu: ${chosen.join(" > ")}\n` : "";
  const suggested = hint
    ? `Analysen foreslog her: "${hint}". Vælg det punkt, der ligger tættest på det, ` +
      "medmindre det tydeligvis er forkert.\n"
    : "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: "Du er en meget erfaren sælger på det danske genbrugsmarked. " +
        (INTRO[kind] || "Vælg den mulighed, der passer bedst."),
      tools: [CHOICE_TOOL],
      tool_choice: { type: "tool", name: CHOICE_TOOL.name },
      messages: [{
        role: "user",
        content: `Vare: ${draft.title}\nBeskrivelse: ${draft.description}\n` +
          `Mærke: ${draft.brand ?? "ukendt"}\nStørrelse: ${draft.size ?? "ukendt"}\n` +
          `Stand: ${draft.condition ?? "ukendt"}\n` +
          // Vinteds kategoristi baerer tit det, titlen tier om. "Pigetoej
          // (2-8 aar)" afgoer koennet, som ellers ville blive gaettet til
          // Unisex, fordi "CeLaVi regnjakke str. 120" ikke roeber noget.
          (Array.isArray(draft.category_path) && draft.category_path.length
            ? `Varen er lagt op på Vinted under: ${(draft.category_path as string[]).join(" > ")}\n`
            : "") +
          `\n${where}${suggested}Muligheder:\n${list}`,
      }],
    }),
  });
  if (!res.ok) return -1;
  const block = (await res.json()).content?.find((b: { type?: string }) => b.type === "tool_use");
  const i = Number(block?.input?.index);
  return Number.isInteger(i) && i >= 0 && i < options.length ? i : -1;
}

// ---- Markedsanalyse ------------------------------------------------------
// Arbejdsdelingen er den samme som på Vinted: modellen dømmer HVILKE annoncer
// der er sammenlignelige, og skriver teksten — det er skøn. Regnestykket
// lægges herude, for en model regner upålideligt.
//
// Prisen på udkastet kom fra Vinted. DBA er et andet marked, så den sættes
// forfra her ud fra DBA's egne annoncer.

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Runde tal sælger. 87 kr ser regnet ud; 85 ser besluttet ud.
function roundPrice(n: number): number {
  if (n <= 0) return 0;
  if (n < 100) return Math.max(10, Math.round(n / 5) * 5);
  if (n < 500) return Math.round(n / 10) * 10;
  return Math.round(n / 25) * 25;
}

const MARKET_TOOL = {
  name: "saet_annoncen",
  description: "Sæt pris og tekst ud fra DBA's egne annoncer og billederne.",
  input_schema: {
    type: "object",
    properties: {
      sammenlignelige: {
        type: "array",
        items: { type: "integer" },
        description:
          "Numrene på de annoncer, der reelt er sammenlignelige med varen — samme slags vare, " +
          "nogenlunde samme størrelse og stand. Udelad tilbehør, reservedele, bøger om emnet, " +
          "store partier og alt, der tydeligvis er noget andet.",
      },
      price: { type: "integer", description: "Prisen i hele kroner." },
      title: {
        type: "string",
        description:
          "Annonceoverskrift til DBA, højst 70 tegn. Det, en køber søger på: mærke, varetype, " +
          "størrelse, farve. Ingen udråbstegn.",
      },
      description: {
        type: "string",
        description:
          "Beskrivelsen på dansk, 3-6 linjer. Konkret om stand, pasform og eventuelle fejl. " +
          "Ingen sælger-sprog, ingen udråbstegn.",
      },
      captions: {
        type: "array",
        items: { type: "string" },
        description:
          "Én billedtekst pr. billede, i samme rækkefølge som billederne. Højst 80 tegn hver. " +
          "Sig hvad man SER på netop det billede — ikke en gentagelse af overskriften.",
      },
      note: { type: "string", description: "Én kort linje om, hvordan prisen blev sat." },
    },
    required: ["sammenlignelige", "price", "title", "description", "captions", "note"],
  },
};

const MARKET_SYSTEM =
  "Du er en meget erfaren sælger på DBA med speciale i det danske genbrugsmarked.\n" +
  "Du får varens billeder og de annoncer, DBA viser lige nu for sammenlignelige varer.\n\n" +
  "VIGTIGT om priserne: DBA viser det, der IKKE er solgt endnu. De annoncer, du ser, er " +
  "altså dem, der har ligget længst — feltet skævvrider opad. Prisen skal derfor lægge sig " +
  "PÅ eller UNDER medianen af de sammenlignelige. Målet er et hurtigt salg, ikke den højest " +
  "tænkelige pris.\n\n" +
  "Døm varens stand ud fra BILLEDERNE, ikke ud fra den eksisterende tekst, som er skrevet " +
  "til en anden platform. Er der slid eller pletter at se, skal det stå i beskrivelsen — " +
  "en køber, der bliver overrasket, sender varen retur.\n\n" +
  "Billedteksterne skal sige noget, billedet faktisk viser: et mærkat, en lynlås, et slidt " +
  "sted. En billedtekst, der gentager overskriften, er spildt plads.\n" +
  "Skriv dansk, ligefremt og uden udråbstegn.";

async function analyseMarket(
  draft: Record<string, unknown>,
  items: Array<{ id: string; price: number; text: string; tier?: string }>,
  maerkeAntal = 0,
  kategoriNavn = "",
): Promise<Record<string, unknown> | null> {
  const photos = (Array.isArray(draft.photos) ? draft.photos : []) as Array<{ url?: string; kind?: string }>;
  const list = items.map((it, i) => `${i}: [${it.tier ?? "?"}] ${it.price} kr — ${it.text}`).join("\n");
  const billeder = photos.map((p, i) => `${i + 1}: ${p.kind ?? "billede"}`).join(", ");

  // Sig hvad grundlaget ER. Blander man faa annoncer af maerket sammen med
  // mange fra kategorien uden at sige det, laeser modellen det hele som ét
  // felt og traekker prisen mod kategoriens midte - ogsaa naar maerket ligger
  // klart over eller under den.
  const katAntal = items.length - maerkeAntal;
  const grundlag = maerkeAntal >= 8
    ? `Grundlaget er ${maerkeAntal} annoncer med SAMME MÆRKE. De er den rette målestok.\n\n`
    : maerkeAntal > 0
    ? `Bemærk: der er kun ${maerkeAntal} annoncer med samme mærke — for få til at stå alene. ` +
      `Derfor er der hentet ${katAntal} annoncer fra samme kategori${kategoriNavn ? ` (${kategoriNavn})` : ""} ` +
      `som bredere grundlag. Hver annonce er mærket [mærke] eller [kategori].\n` +
      `Brug kategorien til at se, hvor markedet ligger, og brug de få af mærket til at afgøre, ` +
      `om denne vare hører over, under eller midt i det felt. Et stærkt mærke skal ikke trækkes ` +
      `ned til kategoriens midte — og et svagt skal ikke løftes op til den.\n\n`
    : `Varen har intet oplyst mærke, så grundlaget er ${katAntal} annoncer fra samme ` +
      `kategori${kategoriNavn ? ` (${kategoriNavn})` : ""}. Døm ud fra billederne, hvor i det felt varen hører hjemme.\n\n`;

  const content: unknown[] = photos
    .filter((p) => p?.url)
    .map((p) => ({ type: "image", source: { type: "url", url: p.url } }));
  content.push({
    type: "text",
    text: `Vare: ${draft.title}\nNuværende beskrivelse (skrevet til Vinted): ${draft.description}\n` +
      `Mærke: ${draft.brand ?? ""}\nStørrelse: ${draft.size ?? ""}\nStand: ${draft.condition ?? ""}\n` +
      `Farve: ${draft.color ?? ""}\nMateriale: ${draft.material ?? ""}\n\n` +
      `Billederne ovenfor er i rækkefølgen: ${billeder}\n\n` +
      grundlag +
      `Annoncer på DBA lige nu:\n${list}`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1600,
      system: MARKET_SYSTEM,
      tools: [MARKET_TOOL],
      tool_choice: { type: "tool", name: MARKET_TOOL.name },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) return null;
  const block = (await res.json()).content?.find((b: { type?: string }) => b.type === "tool_use");
  const out = block?.input as Record<string, unknown> | undefined;
  if (!out) return null;

  // Regnestykket herude. Modellen har valgt hvilke annoncer der taeller;
  // medianen og spaerren er vores.
  const valgte = (Array.isArray(out.sammenlignelige) ? out.sammenlignelige : [])
    .map((i) => items[Number(i)])
    .filter(Boolean)
    .map((it) => it.price)
    .filter((n) => n > 0);

  let price = Math.round(Number(out.price) || 0);
  let note = String(out.note ?? "");
  if (valgte.length >= 3) {
    const med = median(valgte);
    // Spaerren: uanset hvad modellen naaede frem til, maa prisen ikke lande
    // over medianen af de sammenlignelige. Det synlige felt er de usolgte.
    if (price > med) {
      price = med;
      const kilde = maerkeAntal >= 8 ? "af samme mærke" : "fra samme kategori";
      note = `lagt på medianen af ${valgte.length} sammenlignelige ${kilde} (${med} kr)`;
    }
    price = roundPrice(price);
  } else {
    price = roundPrice(price);
    note = note || "for få sammenlignelige — skønnet er beholdt";
  }

  const captions = (Array.isArray(out.captions) ? out.captions : [])
    .map((c) => clean(c).slice(0, 80));

  return {
    price: price || null,
    title: clean(out.title).slice(0, 70),
    description: clean(out.description),
    captions,
    note,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) return json({ error: "unauthorized" }, 401);

  // Userscripts (iOS) tilbyder kun installation, hvis selve STIEN ender paa
  // .user.js, og filen skal udleveres som ren tekst. Samme greb som Vinteds.
  const wantsUserscript = url.pathname.endsWith(".user.js") || url.searchParams.get("userscript") === "1";
  if (req.method === "GET" && wantsUserscript) {
    const base = `${SUPABASE_URL}/functions/v1/dba-fill-script`;
    const api = `${base}?key=${SHORTCUT_KEY}`;
    const install = `${base}/dba.user.js?key=${SHORTCUT_KEY}`;
    let h = 0;
    for (let i = 0; i < RUNNER.length; i++) h = (h * 31 + RUNNER.charCodeAt(i)) >>> 0;
    const body = [
      "// ==UserScript==",
      "// @name         VintedAuto — DBA",
      "// @namespace    udbakke",
      `// @version      1.0.${h % 100000}`,
      "// @description  Udfylder DBA-annoncen automatisk",
      "// @match        https://www.dba.dk/recommerce/create/*",
      "// @match        https://dba.dk/recommerce/create/*",
      "// @run-at       document-idle",
      "// @grant        none",
      "// @inject-into  page",
      `// @downloadURL  ${install}`,
      `// @updateURL    ${install}`,
      "// ==/UserScript==",
      "",
      `window.__UDBAKKE_DBA_API__=${JSON.stringify(api)};`,
      "window.__UDBAKKE_DBA_AUTO__=true;",
      RUNNER,
    ].join("\n");
    return new Response(body, {
      headers: { ...CORS, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (req.method === "GET" && url.searchParams.get("script") === "1") {
    return new Response(RUNNER, {
      headers: { ...CORS, "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (req.method === "GET") {
    // Automatisk tilstand maa kun gribe ind, naar du netop har trykket
    // "Udfyld i DBA" i appen — ellers ville enhver tur forbi opret-siden faa
    // en gammel annonce skrevet ind under haenderne paa dig.
    const auto = url.searchParams.get("auto") === "1";
    const freshSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("drafts")
      .select("id, title, description, price, condition, brand, size, color, material, category_path, photos, reshopper")
      .eq("status", "ny")
      .gte(auto ? "selected_at" : "created_at", auto ? freshSince : "1970-01-01")
      .order("selected_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ empty: true });

    const photoUrls = (Array.isArray(data.photos) ? data.photos : [])
      .map((p: { url?: string }) => p?.url)
      .filter((u: unknown): u is string => typeof u === "string" && !!u);

    // Koennet er allerede udledt, hvis annoncen har vaeret klargjort til
    // Reshopper. Er den ikke det, vaelger modellen ud fra varen i stedet.
    const rs = (data.reshopper ?? {}) as Record<string, unknown>;
    const gender = rs.gender === "boy" ? "Dreng" : rs.gender === "girl" ? "Pige" : "";

    return json({
      id: data.id,
      photos: photoUrls,
      title: clean(data.title),
      description: clean(data.description),
      price: plainPrice(data.price || ""),
      // Vinteds kategoristi er ikke DBA's, men den siger hvad varen ER, og
      // det er et godt udgangspunkt for valget paa hvert niveau.
      categoryPath: Array.isArray(data.category_path) ? data.category_path : [],
      brand: clean(data.brand || ""),
      size: clean(data.size || ""),
      color: clean(data.color || ""),
      material: clean(data.material || ""),
      condition: clean(data.condition || ""),
      searchQuery: clean(data.title || ""),
      gender,
    });
  }

  if (req.method === "POST") {
    let body: {
      id?: string; mode?: string; kind?: string; chosen?: string[];
      options?: string[]; hint?: string; items?: unknown[];
      maerkeAntal?: number; kategoriNavn?: string;
    };
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    if (!body.id) return json({ error: "missing_id" }, 400);

    if (body.mode === "clear") {
      await supabase.from("drafts").update({ selected_at: null }).eq("id", body.id);
      return json({ ok: true });
    }

    if (body.mode === "market") {
      const { data } = await supabase
        .from("drafts")
        .select("title, description, brand, size, condition, color, material, photos")
        .eq("id", body.id).single();
      if (!data) return json({ error: "no_draft" }, 404);
      const items = (Array.isArray(body.items) ? body.items : [])
        .map((i) => i as { id: string; price: number; text: string; tier?: string })
        .filter((i) => i && Number(i.price) > 0)
        .slice(0, 60);
      if (items.length < 4) return json({ note: "for få annoncer" });
      try {
        const out = await analyseMarket(
          data as Record<string, unknown>,
          items,
          Number(body.maerkeAntal) || 0,
          String(body.kategoriNavn ?? ""),
        );
        return json(out ?? { note: "analysen gav intet" });
      } catch (err) {
        console.error("market failed", err);
        return json({ note: "analysen fejlede" });
      }
    }

    if (body.mode === "choose") {
      const { data } = await supabase
        .from("drafts")
        .select("title, description, brand, size, condition, category_path")
        .eq("id", body.id).single();
      if (!data) return json({ index: -1 });
      const options = (body.options || []).map((o) => String(o));
      if (!options.length) return json({ index: -1 });
      const index = await chooseOption(
        data as Record<string, unknown>,
        String(body.kind || ""),
        (body.chosen || []).map(String),
        options,
        body.hint ? String(body.hint) : undefined,
      );
      return json({ index });
    }

    return json({ error: "unknown_mode" }, 400);
  }

  return json({ error: "method_not_allowed" }, 405);
});
