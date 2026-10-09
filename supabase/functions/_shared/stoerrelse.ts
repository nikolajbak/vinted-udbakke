// Boernetoej faar en boernestoerrelse - hoejden i cm, som Vinted og danske
// koebere bruger (bestemt af dig 9. oktober). Nr. 48, et Nike-drengesaet med
// »L 147-158 cm« paa maerket, kom paa Vinted som »L«, og nr. 15 (Mads
// Noergaard »14«) stod med en alder. Prompten alene holder ikke, saa koden
// regner om efter modellen: et cm-interval paa maerket -> den oeverste ende
// (»str. 158« passer et barn paa op til 158 cm), en alder -> cm efter den
// danske skala (2 aar = 92, +6 cm pr. aar), maaneder -> babystoerrelsen.
// Et bogstav uden cm eller alder ved siden af roeres ikke: Nikes og Adidas'
// boerne-L er ikke det samme, og et gaet er vaerre end bogstavet.

const CM = /^(?:eur?\s*)?(\d{2,3})(?:\s*[\/-]\s*(\d{2,3}))?\s*(?:cm)?$/i;
const MDR_CM: [number, number][] = [[1, 50], [2, 56], [4, 62], [6, 68], [9, 74], [12, 80], [18, 86], [24, 92]];

function alderCm(aar: number): number | null {
  if (aar < 2 || aar > 16) return null;
  return 92 + 6 * (aar - 2);
}

function mdrCm(mdr: number): number | null {
  const hit = MDR_CM.find(([m]) => mdr <= m);
  return hit ? hit[1] : null;
}

// Den oeverste ende af et interval i en tekst: »147-158 cm«, »6-7 år«, »6-9 M«.
function fraTekst(t: string): number | null {
  const cm = t.match(/\b(\d{2,3})\s*(?:[-–\/]\s*(\d{2,3})\s*)?cm\b/i);
  if (cm) {
    const n = Number(cm[2] || cm[1]);
    if (n >= 44 && n <= 176) return n;
  }
  const eur = t.match(/\bEUR?\s*(\d{2,3})\b/i);
  if (eur && Number(eur[1]) >= 44 && Number(eur[1]) <= 176) return Number(eur[1]);
  const aar = t.match(/\b(\d{1,2})\s*(?:[-–\/]\s*(\d{1,2})\s*)?(?:år|aar|y|yrs?|years?|ans|jahre)\b/i);
  if (aar) {
    const n = alderCm(Number(aar[2] || aar[1]));
    if (n) return n;
  }
  const mdr = t.match(/\b(\d{1,2})\s*(?:[-–\/]\s*(\d{1,2})\s*)?(?:m|mdr|mths?|months?|mois)\b/i);
  if (mdr) return mdrCm(Number(mdr[2] || mdr[1]));
  return null;
}

export function erBoernetoej(kategori: unknown, varetype = ""): boolean {
  const sti = Array.isArray(kategori) ? kategori.map(String) : [];
  if (sti[0] !== "Børn") return false;
  // Boernesko har skonumre (20-40), ikke cm.
  return !sti.some((s) => /sko|støvle|sandal/i.test(s)) && !/sko|støvle|sandal|sneaker/i.test(varetype);
}

/** Boernestoerrelsen i cm, eller stoerrelsen uaendret, hvis den ikke kan regnes om sikkert. */
export function boerneStoerrelse(size: unknown, ...maerker: unknown[]): string {
  const s = String(size ?? "").trim();
  // Allerede cm (»128«, »158/164«, »EUR 128«): lad den staa, kun uden »EUR«.
  const cm = s.match(CM);
  if (cm && Number(cm[1]) >= 44) return cm[2] ? `${cm[1]}/${cm[2]}` : cm[1];
  // Stoerrelsen selv kan baere cm eller alder: »L (147-158 cm)«, »14Y«, »6-7 år«.
  const iSelv = fraTekst(s);
  if (iSelv) return String(iSelv);
  // Et rent tal 2-16 er en alder (Mads Noergaard »14«).
  if (/^\d{1,2}$/.test(s)) {
    const n = alderCm(Number(s));
    if (n) return String(n);
  }
  // Ellers maerkernes tekst: »L 147-158 cm« ved siden af bogstavet.
  if (!s || /^(?:x{0,3}s|m|x{0,3}l|\d?x[sl])$/i.test(s)) {
    for (const m of maerker) {
      const n = fraTekst(String(m ?? ""));
      if (n) return String(n);
    }
  }
  return s;
}

/** Retter »str. L« i titlen til den nye stoerrelse. */
export function titelMedStoerrelse(titel: string, gammel: string, ny: string): string {
  if (!gammel || gammel === ny) return titel;
  const esc = gammel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return titel.replace(new RegExp(`(str\\.?\\s*)${esc}(?![\\w])`, "i"), `$1${ny}`);
}
