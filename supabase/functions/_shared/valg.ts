// Står det, appen ville have, i annoncen? Ét svar for hvert felt, så
// kvitteringen (mode anvendt) og synkroniseringen (synkAnnonce) rydder
// pending ens. Rene funktioner, testet med node --test tools/test-valg.mjs.
// Samme regler står i runneren (sammeValg) og i appen (sammeStoerrelse) —
// ret dem sammen.

const norm = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function ensLyd(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

// Vinted skriver stoerrelsen ud: »110« er »5 år / 110 cm«, »M« er »M / 38 /
// 10«, »30« er »EU 46 | W30« (maalt i garderoben 2. november). Samme
// stoerrelse, naar et af udkastets led staar som et helt led i Vinteds.
export function sammeStoerrelse(udkast: unknown, vinted: unknown): boolean {
  if (ensLyd(udkast, vinted)) return true;
  const led = (x: unknown) =>
    norm(x).replace(/½/g, ".5").replace(/(\d),(\d)/g, "$1.$2")
      .split(/[\s/|,()-]+/).map((t) => t.replace(/^(w|l|eu|uk)(?=\d)/, "")).filter(Boolean);
  const v = led(vinted);
  return led(udkast).some((t) => /\d|^[xsml]+$/.test(t) && v.includes(t));
}

// Farver og materialer: »Lyserød, Blå« er det samme som »Blå, Lyserød«.
export function sammeFlere(a: unknown, b: unknown): boolean {
  const s = (x: unknown) => norm(x).split(/\s*,\s*/).filter(Boolean).sort().join(",");
  return s(a) === s(b);
}

// Kategorien ligger i pending som hele stien (Vinteds ord), men annoncen
// kendes kun paa bladet — knappen paa redigeringssiden viser kun det.
function blad(v: unknown): unknown {
  return Array.isArray(v) ? v[v.length - 1] : v;
}

export function passerUde(k: string, ude: unknown, v: unknown): boolean {
  if (ude == null || ude === "") return false;
  if (k === "price") return Math.round(Number(ude)) === Math.round(Number(v));
  if (k === "size") return sammeStoerrelse(v, ude);
  if (k === "color" || k === "material") return sammeFlere(ude, v);
  if (k === "category") return ensLyd(blad(v), blad(ude));
  return ensLyd(ude, v);
}
