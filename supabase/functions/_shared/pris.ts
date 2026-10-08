// En pris er hele kroner. Altid - paa Vinted, DBA, Reshopper og i appen.
//
// Prisen gemmes som tekst i `drafts.price`, og den tekst kan komme fra en
// model ("89,50 kr", "12.50"), fra et prismaerke ("1.200 kr") eller fra dig.
// At slette alt andet end cifre er ikke en afrunding: "89,50" blev til 8950,
// og "1.200" laest som decimaltal blev til 1,2. Saa tallet fortolkes foerst og
// rundes bagefter.
//
// Komma og punktum: staar begge, er det sidste decimaltegnet. Staar kun det
// ene, og efterfoelges det af praecis tre cifre ("1.200", "2,500"), er det et
// tusindtalsskilletegn; ellers er det decimaler ("12.50", "7,5").
//
// Samme regel staar i Vinted-runneren (helKroner) og i app.js (prisTal), som
// ikke kan importere. DBA-runneren faar prisen faerdig fra serveren. Rettes
// reglen her, rettes den dér.

export function helKroner(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const s = String(v ?? "")
    .replace(/(\d)[\s ](?=\d{3}(?!\d))/g, "$1")   // "1 200 kr"
    .match(/\d[\d.,]*/);
  if (!s) return 0;
  let t = s[0].replace(/[.,]+$/, "");
  const sidste = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (sidste >= 0) {
    const tegn = t[sidste];
    const begge = t.includes(".") && t.includes(",");
    const flere = t.split(tegn).length > 2;
    const decimal = begge || (!flere && t.length - sidste - 1 !== 3);
    t = decimal
      ? t.slice(0, sidste).replace(/[.,]/g, "") + "." + t.slice(sidste + 1)
      : t.replace(/[.,]/g, "");
  }
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// En pris skrives som hele kroner med komma og to nuller: "89,00 kr" (bestemt
// af dig 8. oktober). Samme form som kr() i app.js.
export function kr(n: unknown): string {
  return `${Math.round(Number(n))},00 kr`;
}

// Prisen som den staar i udkastet: "89,00 kr". En tom eller ulaeselig pris faar
// lov at staa, som den er: den skal falde i oejnene, ikke erstattes af et
// opfundet tal.
export function prisTekst(v: unknown): string {
  const n = helKroner(v);
  return n > 0 ? kr(n) : String(v ?? "");
}

// En NY vare prissaettes mod sin nypris, ikke kun mod feltet. Bestemt af dig
// 2. oktober: en helt ny Teeshoppen-skjorte til 349 kr blev sat til 35 kr,
// fordi feltet var brugte skjorter til 20-59 kr, og spaerren mod medianen
// trak modellens 45 kr endnu laengere ned. Prisen er en afvejning af varens
// vaerdi (nyprisen) og hvad markedspladsen kan baere - og brugte varer er
// ikke et loft for en ny.
//
// Rammen i procent af nyprisen. Gulvet vinder over markedets loft: hellere en
// ny vare, der ligger lidt laengere, end en, der er givet vaek.
export const NY_GULV_MED_MAERKE = 0.4;
export const NY_GULV_UDEN_MAERKE = 0.35;
export const NY_LOFT = 0.75;

export const NYPRIS_REGEL =
  "Prisen på en NY vare er en afvejning af to ting: hvad varen er værd — nyprisen under Fakta — og " +
  "hvad markedspladsen kan bære. Brugte varer i feltet er IKKE et loft for en ny vare; sammenlign den " +
  "med de nye. Ny med prismærke ligger typisk på 40-60 % af nyprisen, aldrig under " +
  `${NY_GULV_MED_MAERKE * 100} % (${NY_GULV_UDEN_MAERKE * 100} % uden prismærke) og aldrig over ` +
  `${NY_LOFT * 100} %. Kendes nyprisen ikke, så lad de nye annoncer i feltet styre prisen, ikke de brugte.`;

type FaktaPris = { ny?: boolean; nypris?: number } | null | undefined;

export function erNy(fakta: unknown, condition?: unknown): boolean {
  return !!(fakta as FaktaPris)?.ny || /^ny\b/i.test(String(condition ?? "").trim());
}

// Gulv og loft i hele kroner for en ny vare med kendt nypris. null ellers.
export function nyprisRamme(fakta: unknown, condition?: unknown): { gulv: number; loft: number; nypris: number } | null {
  const f = fakta as FaktaPris;
  const nypris = helKroner(f?.nypris);
  if (!erNy(fakta, condition) || nypris <= 0) return null;
  const uden = /uden/i.test(String(condition ?? ""));
  return {
    nypris,
    gulv: Math.ceil(nypris * (uden ? NY_GULV_UDEN_MAERKE : NY_GULV_MED_MAERKE)),
    loft: Math.floor(nypris * NY_LOFT),
  };
}

// Laegger prisen inden for rammen. Note er tom, naar intet blev rettet.
export function iNyprisRamme(pris: number, ramme: ReturnType<typeof nyprisRamme>): { pris: number; note: string } {
  if (!ramme || !(pris > 0)) return { pris, note: "" };
  if (pris < ramme.gulv) {
    return { pris: ramme.gulv, note: `løftet til ${kr(ramme.gulv)} — en ny vare sættes ikke under ${Math.round(ramme.gulv / ramme.nypris * 100)} % af nyprisen på ${kr(ramme.nypris)}` };
  }
  if (pris > ramme.loft) {
    return { pris: ramme.loft, note: `sat ned til ${kr(ramme.loft)} — højst ${NY_LOFT * 100} % af nyprisen på ${kr(ramme.nypris)}` };
  }
  return { pris, note: "" };
}

// Annoncer i ny stand, til spaerren mod medianen. Vinteds egne ord paa dansk,
// og de franske/engelske, saa en anden sprogindstilling ikke skjuler dem.
export function erNyAnnonce(condition: unknown): boolean {
  return /^(ny\b|neuf|new\b|nuevo|neu\b)/i.test(String(condition ?? "").trim());
}
