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

// Prisen som den staar i udkastet: "89 kr". En tom eller ulaeselig pris faar
// lov at staa, som den er: den skal falde i oejnene, ikke erstattes af et
// opfundet tal.
export function prisTekst(v: unknown): string {
  const n = helKroner(v);
  return n > 0 ? `${n} kr` : String(v ?? "");
}
