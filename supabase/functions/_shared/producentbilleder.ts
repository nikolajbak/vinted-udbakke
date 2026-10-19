// Producentens billeder af varen paa en person - kun til appen, som forlaeg.
// De kommer ALDRIG i drafts.photos: Vinted forbyder billeder, saelgeren ikke
// selv har taget (CLAUDE.md »Producentens billeder«).
//
// Filen har ingen imports, saa de rene dele kan proeves med node --test
// (tools/test-producentbilleder.mjs). Modelkaldet ligger i beskrivelse.ts.

export type Pose = "forfra-hel" | "trekvart" | "bagfra" | "naer";
// Raekkefoelgen er researchens: hele figuren forfra fanger blikket, saa
// trekvart, bagfra og stoffet taet paa.
export const POSER: Pose[] = ["forfra-hel", "trekvart", "bagfra", "naer"];
export type ProducentBillede = { url: string; pose: Pose };
export type BilledSvar = { nr: number; sammeVare: boolean; paaPerson: boolean; pose: string };

const MAKS_KANDIDATER = 12;
const MAKS_BILLEDER = 4;
const IKKE_VAREN = /logo|favicon|icon|apple-touch|sprite|placeholder/;
const IKKE_ORD = new Set(["products", "product", "html"]);
const BILLEDE = /(?:https?:)?\/\/[A-Za-z0-9.-]+\/[^"'\s)<>,]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s)<>,]*)?/gi;

function afkod(s: string): string {
  return s.replace(/\\\//g, "/").replace(/\\u002F/gi, "/").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
}

// Absolut og https. JSON-LD og og:image kan staa relativt (»/files/a.jpg«).
function absolut(u: string, side: string): string | undefined {
  const a = u.startsWith("//") ? "https:" + u : u;
  let x: URL;
  try { x = new URL(a, side); } catch {
    try { x = new URL(a); } catch { return undefined; }
  }
  if (x.protocol === "http:") x.protocol = "https:";
  // Shopify skalerer efter forespoergslen: teeshoppen.dk gav forfra-billedet
  // i 360x482 (19. oktober). Uden den er det billedet i fuld stoerrelse.
  if (x.hostname === "cdn.shopify.com" || x.pathname.startsWith("/cdn/shop/")) {
    for (const k of ["width", "height", "crop"]) x.searchParams.delete(k);
  }
  return x.protocol === "https:" ? x.href : undefined;
}

// Samme billede i flere bredder er ét billede: Shopifys srcset giver
// a_200x.jpg, a_800x.jpg ... og ville fylde de tolv pladser med én vare.
function noegle(u: string): string {
  const x = new URL(u);
  return x.origin + x.pathname.replace(/_\d+x\d*(?=\.[a-z]+$)/i, "");
}

// Alle billedadresser i siden. Siden blander varen med anbefalinger og
// samme model i andre farver (teeshoppen.dk, 19. oktober), saa det er kun
// kandidater - en model vaelger bagefter. JSON-LD og og:image (foerst)
// kommer forrest, saa filnavne, der deler ord med sidens sti.
export function billedKandidater(html: string, sideUrl: string, foerst: string[]): string[] {
  // Tal ikke med paa, at kalderen kun sender tekst: opslaget maa aldrig
  // vaelte paa billederne.
  if (typeof html !== "string") html = "";
  if (!Array.isArray(foerst)) foerst = [];
  let ord: string[] = [];
  try {
    ord = new URL(sideUrl).pathname.toLowerCase().split(/[^a-z0-9æøå]+/)
      .filter((o) => o.length >= 4 && !IKKE_ORD.has(o));
  } catch { /* uden sti ingen ord */ }

  const set = new Set<string>();
  const alle: string[] = [];
  const tag = (raa: unknown) => {
    if (typeof raa !== "string") return;
    const u = absolut(afkod(raa), sideUrl);
    if (!u) return;
    const sti = new URL(u).pathname.toLowerCase();
    // {width} og %7Bwidth%7D er Shopifys skabeloner, ikke et billede.
    if (IKKE_VAREN.test(sti) || /[{}]|%7b|%7d/.test(sti) || !/\.(jpe?g|png|webp)$/.test(sti)) return;
    const n = noegle(u);
    if (set.has(n)) return;
    set.add(n);
    alle.push(u);
  };
  for (const f of foerst) tag(f);
  const fra = alle.length;
  for (const m of afkod(html).match(BILLEDE) ?? []) tag(m);

  const deler = (u: string) => {
    const fil = new URL(u).pathname.toLowerCase().split("/").pop() ?? "";
    return ord.some((o) => fil.includes(o));
  };
  const resten = alle.slice(fra);
  return [
    ...alle.slice(0, fra),
    ...resten.filter(deler),
    ...resten.filter((u) => !deler(u)),
  ].slice(0, MAKS_KANDIDATER);
}

// Modellens svar pr. kandidat (nr er 1-baseret) -> hoejst fire billeder,
// ét pr. pose, i poseraekkefoelgen. Et nr, der ikke findes, kan ikke komme
// ind: adressen skal have staaet i sidens HTML.
export function udvaelg(kandidater: string[], svar: BilledSvar[]): ProducentBillede[] {
  const valgt = new Map<Pose, string>();
  for (const s of Array.isArray(svar) ? svar : []) {
    const url = kandidater[Number(s?.nr) - 1];
    const pose = s?.pose as Pose;
    if (!url || s.sammeVare !== true || s.paaPerson !== true || !POSER.includes(pose)) continue;
    if (!valgt.has(pose)) valgt.set(pose, url);
  }
  return POSER.filter((p) => valgt.has(p)).map((p) => ({ url: valgt.get(p)!, pose: p })).slice(0, MAKS_BILLEDER);
}
