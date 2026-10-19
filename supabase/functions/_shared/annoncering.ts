// Betalt annoncering: boost paa Vinted og andre markedspladsers betalte
// synlighed (bestemt af dig 19. oktober). Rene funktioner uden imports, saa
// de kan proeves med node --test (tools/test-annoncering.mjs).
// Appen har en kopi af boostSalg (erBoostSalg i app.js) - ret dem sammen.

export type Tal = {
  impressions: number;
  views: number;
  favorites: number;
  conversations: number;
  forskel?: number | null;
};

export type Faktura = { slags: "boost"; dage: number; antal: number; kr: number; tekst: string };

// Et salg under boostet eller op til 7 dage efter er et boost-salg.
export const EFTER_DAGE = 7;
// Grænserne, til der er mindst 5 andre boostede varer med tal at maale mod.
export const FAST_KLIK_PCT = 1.5;
export const FAST_HJERTE_PCT = 5;
export const MIN_ANDRE = 5;
export const ANDEL_AF_MEDIAN = 0.7;
export const MANGE_HJERTER = 5;

const DAG = 86400000;

// »25.38 kr.« og »1.234,50 kr.«: staar baade komma og punktum, er det
// sidste decimaltegnet; staar kun det ene foran praecis tre cifre, er det
// tusinder - samme regel som _shared/pris.ts.
function beloeb(s: string): number | null {
  let t = s.replace(/\s/g, "");
  if (!/\d/.test(t)) return null;
  const komma = t.lastIndexOf(","), punkt = t.lastIndexOf(".");
  if (komma >= 0 && punkt >= 0) {
    const dec = Math.max(komma, punkt);
    t = t.slice(0, dec).replace(/[.,]/g, "") + "." + t.slice(dec + 1);
  } else if (komma >= 0 || punkt >= 0) {
    const tegn = komma >= 0 ? "," : ".";
    const dele = t.split(tegn);
    t = dele.length === 2 && dele[1].length !== 3 ? dele[0] + "." + dele[1] : dele.join("");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Vinteds faktura for et boost, maalt paa mail 44 (19. oktober): emnet
// »Boost af din artikel - din faktura«, og i teksten »3-dags lokalt Boost
// (2 Artikler)« og »I alt« med beloebet bagefter. Mailen naevner ikke varerne.
export function laesFaktura(emne: string, tekst: string): Faktura | null {
  if (!/boost af din artikel/i.test(emne)) return null;
  const linje = tekst.match(/(\d+)-dags?[^\n]*?boost[^\n]*?\((\d+)\s*artikl/i);
  const ialt = tekst.match(/i alt\s*(-?[\d.,\s]*\d)\s*kr/i);
  if (!linje || !ialt) return null;
  const kr = beloeb(ialt[1]);
  if (kr == null || kr < 0) return null;
  return {
    slags: "boost", dage: Number(linje[1]), antal: Number(linje[2]),
    kr: Math.round(kr * 100) / 100, tekst: linje[0].trim(),
  };
}

const pct = (a: number, b: number) => Math.round((a / b) * 1000) / 10;

export function tragt(t: Tal | null) {
  if (!t || !(Number(t.impressions) > 0)) return null;
  const vist = Number(t.impressions), klik = Number(t.views) || 0, hjerter = Number(t.favorites) || 0;
  return {
    vist, klik, klikPct: pct(klik, vist),
    hjerter, hjertePct: klik > 0 ? pct(hjerter, klik) : 0,
    beskeder: Number(t.conversations) || 0,
  };
}

function median(a: number[]): number | null {
  const s = a.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const komma = (n: number) => String(n).replace(".", ",");
const tusind = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const kroner = (n: number) => {
  const [hel, dec] = (Math.round(n * 100) / 100).toFixed(2).split(".");
  return tusind(Number(hel)) + "," + dec + " kr";
};

// Hvad boostets tal siger om varen - én ting, den vigtigste foerst. Graensen
// er 0,7 x medianen af dine andre boostede varer, naar der er mindst 5 med
// tal; ellers en fast graense, og saa siger dommen, at det er et skoen.
export function boostDom(
  t: Tal | null, andre: Tal[], o: { solgtFor?: number | null; slut: string; nu?: Date },
): string | null {
  if (o.solgtFor) return "Boostet betalte sig: solgt for " + kroner(o.solgtFor) + ".";
  const f = tragt(t);
  if (!f) return null;
  const andreF = andre.map(tragt).filter((x): x is NonNullable<ReturnType<typeof tragt>> => !!x);
  const sammenlign = andreF.length >= MIN_ANDRE;
  const klikGr = sammenlign ? ANDEL_AF_MEDIAN * (median(andreF.map((x) => x.klikPct)) ?? 0) : FAST_KLIK_PCT;
  const hjGr = sammenlign ? ANDEL_AF_MEDIAN * (median(andreF.map((x) => x.hjertePct)) ?? 0) : FAST_HJERTE_PCT;
  const kilde = sammenlign ? " (mod dine andre boostede varer)" : " (skøn — for få boostede varer at måle mod)";
  const nu = o.nu ?? new Date();
  if (f.klikPct < klikGr) {
    return "Få klik: forsidebilledet, titlen eller prisen i feedet fanger ikke — " +
      komma(f.klikPct) + " % klikker" + kilde + ".";
  }
  if (f.hjertePct < hjGr) {
    return "Klik, men få hjerter: billederne, teksten eller prisen på varens side skuffer — " +
      komma(f.hjertePct) + " % giver et hjerte" + kilde + ".";
  }
  if (f.hjerter >= MANGE_HJERTER && new Date(o.slut).getTime() < nu.getTime()) {
    return "Mange hjerter, intet salg: prisen holder dem tilbage (" + f.hjerter + " hjerter).";
  }
  return "Klikrate " + komma(f.klikPct) + " % og hjerterate " + komma(f.hjertePct) + " % — på niveau" + kilde + ".";
}

export function boostSalg(r: { start: string; slut: string }, soldAt: string | null): boolean {
  if (!soldAt || !r.start || !r.slut) return false;
  const s = new Date(soldAt).getTime();
  return s >= new Date(r.start).getTime() && s <= new Date(r.slut).getTime() + EFTER_DAGE * DAG;
}

function dato(iso: string): string {
  const d = new Date(iso);
  const dele = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "numeric" })
    .formatToParts(d);
  const dag = dele.find((p) => p.type === "day")?.value ?? "";
  const md = dele.find((p) => p.type === "month")?.value ?? "";
  return dag + "." + md;
}

// Til prompterne (gennemgangen af salgene, prisvagten).
export function boostLinje(
  r: { start: string; slut: string; kr: number | null; tal: Tal | null }, soldAt: string | null,
): string {
  const dage = Math.max(1, Math.round((new Date(r.slut).getTime() - new Date(r.start).getTime()) / DAG));
  const f = tragt(r.tal);
  return "boostet " + dage + " d" + (r.kr != null ? " for " + kroner(Number(r.kr)) : " (beløb ukendt)") +
    " fra " + dato(r.start) +
    (f ? " (" + tusind(f.vist) + " vist, " + f.klik + " klik, " + f.hjerter + " hjerter)" : "") +
    (boostSalg(r, soldAt) ? ", solgt under/efter boostet" : "");
}
