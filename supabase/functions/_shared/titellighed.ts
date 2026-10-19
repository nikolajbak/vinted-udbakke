// En mail fra Vinted bærer annoncens titel, som den står på Vinted LIGE NU.
// Er titlen rettet i Vinteds egen app, sender Vinted ingen mail om det, og
// appen kender kun den gamle (19. oktober, nr. 7: »Teeshoppen parka
// vinterjakke …« i appen, »Teeshoppen Edmund lang parka vinterjakke …« i
// salgsmailen). Så parres der på titlens ord - men kun entydigt: hellere en
// mail uden annonce end en på den forkerte vare. Rene funktioner, testet med
// node --test tools/test-titellighed.mjs.

const FYLDORD = new Set(["str", "og", "i", "med", "til", "ny", "nye", "helt", "kr", "the", "and"]);

export function titelOrd(t: unknown): Set<string> {
  return new Set(String(t ?? "").toLowerCase().split(/[^a-z0-9æøåäöü]+/)
    .filter((o) => o.length > 1 && !FYLDORD.has(o)));
}

// Dice: andelen af fælles ord, 0-1.
export function titelLighed(a: unknown, b: unknown): number {
  const A = titelOrd(a), B = titelOrd(b);
  if (!A.size || !B.size) return 0;
  let faelles = 0;
  for (const o of A) if (B.has(o)) faelles++;
  return 2 * faelles / (A.size + B.size);
}

// Titlen i et emne fra Vinted, uden »Fwd:«, »Ordreopdatering til« og
// fragtmærkatets frist.
export function emneTitel(emne: string): string {
  return String(emne ?? "")
    .replace(/^\s*(?:(?:fwd?|vs|videresendt|wg)\s*:\s*)*/i, "")
    .replace(/^ordreopdatering til\s+/i, "")
    .replace(/\s+(?:fragtmærkat\s*[–-]|fragtkode:).*$/i, "")
    .trim();
}

export const MINDST = 0.6, AFSTAND = 0.15;

// Den vare (indeks i `titler`), hvis titel ligner en af `kandidater` mest -
// mindst MINDST, og den næstbedste vare mindst AFSTAND længere væk.
// `titler[i]` er alle de titler, vare i kendes under (appens og Vinteds).
export function bedsteTitel(titler: unknown[][], kandidater: unknown[]): number | null {
  const point = titler.map((navne) => {
    let b = 0;
    for (const n of navne) for (const k of kandidater) b = Math.max(b, titelLighed(n, k));
    return b;
  });
  let i = -1;
  point.forEach((p, k) => { if (i < 0 || p > point[i]) i = k; });
  if (i < 0 || point[i] < MINDST) return null;
  const naest = Math.max(0, ...point.filter((_, k) => k !== i));
  return point[i] - naest >= AFSTAND ? i : null;
}
