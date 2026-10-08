// Prisvagten: beslutningen om, hvad en vare der ikke er solgt, skal koste nu.
//
// Arbejdsdelingen er den samme som i markedsanalysen, og af samme grund:
// modellen doemmer HVAD signalerne betyder - regnestykket ligger herude, for
// en model regner upaalideligt, og det her tal gaar direkte i en rigtig
// annonce paa et rigtigt marked.
//
// Det vigtigste, prisvagten kan, er at holde op. En nedsaettelse, der ikke
// rykkede noget, er et argument MOD at saenke igen - ikke for. Uden den
// spaerre ender enhver automatisk prisvagt paa bunden.

export type Vagt = {
  id: string;
  title: string;
  platform: string;
  price: number;
  start_price: number;
  floor_price: number | null;
  listed_at: string;
  last_change_at: string | null;
  checks: number;
  favourites: number;
  favourites_prev: number;
  historik: Array<{ at: string; kind: string; price: number | null; from_price: number | null; favourites: number | null }>;
};

export type Maaling = {
  id: string;
  gone?: boolean;
  price?: number;
  favourites?: number;
  views?: number;
  comparables?: Array<{
    price?: number; favourites?: number; title?: string;
    brand?: string; size?: string; condition?: string;
  }>;
};

export type Beslutning = {
  id: string;
  handling: "saenk" | "behold" | "stop";
  nyPris: number;
  begrundelse: string;
  naesteTjekDage: number;
  median: number | null;
  sammenlignelige: number;
  spaerret: string | null;
};

// ---- Regnestykket ---------------------------------------------------------

export function stats(values: number[]) {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (f: number) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * f)))];
  return { n: v.length, min: v[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: v[v.length - 1] };
}

// Samme afrunding som resten af huset: koebere skimmer i runde spring.
export function roundPrice(n: number): number {
  if (n <= 0) return 0;
  if (n < 100) return Math.max(15, Math.round(n / 5) * 5);
  if (n < 300) return Math.round(n / 10) * 10;
  return Math.round(n / 25) * 25;
}

export function dage(fra: string | null | undefined, til = Date.now()): number {
  if (!fra) return 0;
  const t = new Date(fra).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((til - t) / 86400000));
}

// Bunden. Saettes den ikke i appen, udleder vi en: 40 % af udbudsprisen, og
// aldrig under 15 kr. Det er ikke et gaet paa varens vaerdi - det er en
// spaerre mod at en automatik, der koerer i maaneder, ender med at foraere
// varen vaek, mens ingen kigger.
export function bund(v: Vagt): number {
  if (v.floor_price && v.floor_price > 0) return Math.max(15, Math.round(v.floor_price));
  return Math.max(15, roundPrice(v.start_price * 0.4));
}

// Hvor meget maa der maksimalt ryge af paa én runde. Store spring er ikke
// noedvendigvis forkerte - men de skal traeffes af beslutningen, ikke af et
// uheld i et modelsvar.
const MAKS_SPRING = 0.18;
// Under dette er en nedsaettelse ikke en nedsaettelse. 3 kr af 145 ser ingen,
// og det braender en runde af paa ingenting.
const MINDSTE_SPRING_KR = 5;
const MINDSTE_SPRING_PCT = 0.04;
// En pris skal have lov at virke, foer den doemmes.
const MINDST_DAGE_MELLEM = 5;

const SYSTEM =
  "Du passer priserne paa en privat saelgers varer paa det danske genbrugsmarked. " +
  "Varen er lagt op og ikke solgt. Dit job er at afgoere, om prisen skal ned nu, hvor meget, " +
  "og hvornaar der skal kigges igen.\n\n" +

  "Forstaa tallene rigtigt:\n" +
  "- Vinted skjuler solgte varer. De sammenlignelige annoncer, du faar at se, er dem der IKKE " +
  "blev solgt. Feltet skaevvrider derfor opad, og medianen ligger systematisk over dét, de solgte " +
  "varer faktisk gik for.\n" +
  "- Hjerter er interesse ved den NUVAERENDE pris. Hjerter, der stiger uden at der kommer et salg, " +
  "betyder 'taet paa, men ikke helt' — dér virker et lille, afgoerende spring. Nul hjerter efter " +
  "flere uger betyder, at varen ikke bliver set eller ikke er efterspurgt; dér er prisen sjaeldent " +
  "det eneste problem, men den er den eneste haandtag, vi har herfra.\n" +
  "- Historikken er det staerkeste signal, du har. Saenkede vi sidst, og skete der INTET — hverken " +
  "hjerter eller salg — saa er prisen ikke det, der staar i vejen, og endnu en nedsaettelse er " +
  "penge smidt ud. Sig da 'stop'.\n" +
  "- Er feltet selv steget siden varen blev lagt op (saeson, efterspoergsel), saa hold prisen. " +
  "Man saenker ikke ind i et marked, der gaar den anden vej.\n\n" +

  "Vaelg én handling:\n" +
  "- 'saenk': prisen ned nu. Faerre og stoerre spring slaar mange smaa: et spring, koeberen kan se, " +
  "flytter varen i deres oejne, mens tre paa 5 kr bare goer den billigere.\n" +
  "- 'behold': prisen faar lov at staa denne runde. Brug den, naar prisen lige er sat ned, naar " +
  "feltet er paa vej op, eller naar interessen er stigende.\n" +
  "- 'stop': prisvagten skal holde op med at saenke denne vare. Brug den, naar vi er ved bunden, " +
  "eller naar nedsaettelser beviseligt ikke rykker noget. Skriv da i begrundelsen, hvad der ellers " +
  "skal laves om — billeder, titel, kategori — eller at varen skal tages hjem.\n\n" +

  "Begrundelsen er ét til to sprog paa dansk, til saelgeren selv. Konkret, ingen salgstale.";

const VAGT_TOOL = {
  name: "saet_ny_pris",
  description: "Afgør hvad varen skal koste nu.",
  input_schema: {
    type: "object",
    properties: {
      handling: {
        type: "string",
        enum: ["saenk", "behold", "stop"],
        description: "saenk = ned nu. behold = lad staa denne runde. stop = hold op med at saenke.",
      },
      nyPris: {
        type: "integer",
        description: "Den nye pris i hele kroner. Ved 'behold' og 'stop': den nuværende pris.",
      },
      begrundelse: {
        type: "string",
        description: "1-2 sætninger på dansk til sælgeren om hvorfor.",
      },
      naesteTjekDage: {
        type: "integer",
        description: "Hvor mange dage der skal gå, før der kigges igen. 3-30.",
      },
    },
    required: ["handling", "nyPris", "begrundelse", "naesteTjekDage"],
  },
};

function historikLinjer(v: Vagt): string {
  const h = v.historik.filter((e) => e.kind === "aendret" || e.kind === "maalt").slice(0, 8);
  if (!h.length) return "Ingen tidligere runder — det her er første tjek.";
  return h.map((e) => {
    const d = dage(e.at);
    if (e.kind === "aendret") {
      return `- for ${d} dage siden: pris ${e.from_price} → ${e.price} kr`;
    }
    return `- for ${d} dage siden: målt, ${e.favourites ?? 0} hjerter`;
  }).join("\n");
}

export async function beslutPris(
  v: Vagt,
  m: Maaling,
  callTool: (system: string, content: unknown, tool: unknown) => Promise<Record<string, unknown>>,
): Promise<Beslutning> {
  const felt = stats((m.comparables ?? []).map((c) => Number(c.price)));
  const gulv = bund(v);
  const nu = Math.round(m.price && m.price > 0 ? m.price : v.price);
  const paaMarkedet = dage(v.listed_at);
  const sidenAendring = v.last_change_at ? dage(v.last_change_at) : paaMarkedet;
  const hjerter = Number.isFinite(m.favourites as number) ? Number(m.favourites) : v.favourites;

  // Placeringen i feltet er det, der goer forskel paa "for dyr" og "allerede
  // billigst". Uden den ville modellen saenke en vare, der i forvejen ligger
  // under alle andre.
  const priser = (m.comparables ?? []).map((c) => Number(c.price)).filter((n) => n > 0);
  const under = priser.filter((p) => p > nu).length;
  const placering = priser.length
    ? Math.round((priser.filter((p) => p < nu).length / priser.length) * 100)
    : null;

  const feltLinjer = (m.comparables ?? []).slice(0, 40).map((c, i) =>
    `${i}: ${c.price} kr | ${c.favourites || 0} hjerter | ${c.brand || "uden mærke"} | ` +
    `str. ${c.size || "?"} | ${c.condition || "?"} | ${String(c.title || "").slice(0, 60)}`
  ).join("\n");

  const text =
    `Varen: ${v.title}\n` +
    `Lagt op for ${paaMarkedet} dage siden til ${v.start_price} kr. Koster nu ${nu} kr.\n` +
    `Sidste prisændring: ${v.last_change_at ? `for ${sidenAendring} dage siden` : "ingen"}. ` +
    `Tjek nr. ${v.checks + 1}.\n` +
    `Hjerter: ${hjerter} (ved sidste tjek: ${v.favourites_prev}).\n` +
    `Mindstepris, der IKKE må underskrides: ${gulv} kr.\n\n` +
    `Historik:\n${historikLinjer(v)}\n\n` +
    (felt
      ? `Feltet lige nu — ${felt.n} aktive, sammenlignelige annoncer: ` +
        `${felt.min}-${felt.max} kr, p25 ${felt.p25}, median ${felt.median}, p75 ${felt.p75} kr. ` +
        `Vores pris ligger over ${placering}% af dem; ${under} annoncer er dyrere end vores.\n\n` +
        `${feltLinjer}\n\n`
      : "Der er ingen brugbare sammenlignelige annoncer denne gang — døm ud fra historikken alene, " +
        "og vær tilbageholdende.\n\n") +
    "Afgør handlingen.";

  const out = await callTool(SYSTEM, text, VAGT_TOOL);

  let handling = String(out.handling ?? "behold") as Beslutning["handling"];
  if (handling !== "saenk" && handling !== "behold" && handling !== "stop") handling = "behold";
  let pris = Math.round(Number(out.nyPris) || nu);
  // Modellens eget tal gemmes: naar en spaerre flytter prisen, staar tallet
  // stadig i begrundelsen, og saa ville skaermen sige to forskellige ting.
  const modelPris = pris;
  let spaerret: string | null = null;
  let bremset = false;

  // ---- Spaerrerne. Rekkefoelgen er ikke tilfaeldig: afrundingen skal ske
  // FOER bunden, ellers kan en oprunding skubbe prisen under den igen.
  if (handling === "saenk") {
    if (pris >= nu) { handling = "behold"; pris = nu; spaerret = "modellen ville ikke sætte ned"; }
    else {
      const loft = Math.floor(nu * (1 - MAKS_SPRING));
      if (pris < loft) {
        pris = loft; bremset = true;
        spaerret = `springet er begrænset til ${Math.round(MAKS_SPRING * 100)}%`;
      }
      const feltgulv = felt ? Math.floor(felt.p25 * 0.6) : 0;
      if (feltgulv && pris < feltgulv) { pris = feltgulv; spaerret = "prisen ville stikke af nedad fra feltet"; }
      pris = roundPrice(pris);
      if (pris < gulv) { pris = gulv; spaerret = "mindsteprisen"; }
      if (pris >= nu) { handling = "behold"; pris = nu; spaerret = spaerret || "der er ikke plads til at sætte ned"; }
    }
  } else {
    pris = nu;
  }

  // En pris skal have lov at virke. Og et spring, ingen kan se, er ikke et
  // spring — det braender bare en runde af.
  if (handling === "saenk" && sidenAendring < MINDST_DAGE_MELLEM) {
    handling = "behold"; pris = nu;
    spaerret = `prisen blev sat ned for ${sidenAendring} dage siden`;
  }
  if (handling === "saenk") {
    const fald = nu - pris;
    if (fald < Math.max(MINDSTE_SPRING_KR, Math.round(nu * MINDSTE_SPRING_PCT))) {
      handling = "behold"; pris = nu; spaerret = "nedsættelsen ville være for lille til at ses";
    }
  }
  // Er vi paa bunden, er prisen ikke laengere et haandtag. Sig det, i stedet
  // for at blive ved med at kigge forbi hver uge og lade som ingenting.
  if (handling !== "stop" && nu <= gulv && handling !== "saenk") {
    handling = "stop";
    spaerret = spaerret || "mindsteprisen er nået";
  }

  let naeste = Math.round(Number(out.naesteTjekDage) || 7);
  if (!Number.isFinite(naeste)) naeste = 7;
  naeste = Math.min(30, Math.max(3, naeste));
  // Bremsede vi springet, er beslutningen kun halvt gennemfoert. Saa skal der
  // kigges igen snart, ikke om en maaned.
  if (bremset) naeste = Math.min(naeste, 7);

  // Begrundelsen er skrevet FOER spaerrerne, saa den kan naevne et andet tal
  // end det, der faktisk bliver sat. Sig det, i stedet for at lade to tal staa
  // og modsige hinanden paa skaermen.
  let begrundelse = String(out.begrundelse ?? "").trim().slice(0, 400);
  if (handling === "saenk" && pris !== modelPris) {
    begrundelse += ` Prisvagten sætter den til ${pris},00 kr denne gang — ${spaerret}. ` +
      "Resten kan komme næste runde.";
  } else if (handling === "behold" && modelPris < nu) {
    begrundelse += ` Prisen bliver stående på ${nu},00 kr: ${spaerret}.`;
  }

  return {
    id: v.id,
    handling,
    nyPris: pris,
    begrundelse,
    naesteTjekDage: naeste,
    median: felt ? felt.median : null,
    sammenlignelige: felt ? felt.n : 0,
    spaerret,
  };
}
