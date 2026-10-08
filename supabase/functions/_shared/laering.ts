// Erfaringer fra dine egne salg, lagt ind i de prompter, der skriver annoncer
// og svarer koebere. Gennemgangen, der finder dem, staar i
// vinted-fill-script/laering.ts; her hentes kun det, der er slaaet til.
//
// En erfaring er en ekstra. Fejler opslaget, skrives annoncen uden - som den
// blev foer der var noget at laere af.

export type Omraade = "tekst" | "pris" | "billeder" | "kommunikation";

const NAVN: Record<Omraade, string> = {
  tekst: "teksten",
  pris: "prisen",
  billeder: "billederne",
  kommunikation: "svar til købere",
};

export async function hentErfaringer(omraader: Omraade[]): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const noegle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !noegle || !omraader.length) return "";
  try {
    const res = await fetch(
      `${url}/rest/v1/laerdomme?aktiv=eq.true&omraade=in.(${omraader.join(",")})` +
        "&select=omraade,tekst,varer&order=created_at.asc&limit=20",
      { headers: { apikey: noegle, authorization: `Bearer ${noegle}` } },
    );
    if (!res.ok) return "";
    const raekker = await res.json() as Array<{ omraade: Omraade; tekst: string; varer: number[] }>;
    if (!raekker.length) return "";
    return "Erfaringer fra sælgerens egne salg — målt på varer, der er solgt eller har stået " +
      "stille. Følg dem, hvor de passer på varen. Reglerne ovenfor går forud, og opfind aldrig " +
      "noget for at opfylde en erfaring:\n" +
      raekker.map((r) => `- (${NAVN[r.omraade] ?? r.omraade}, ${r.varer?.length ?? 0} varer) ${r.tekst}`)
        .join("\n");
  } catch {
    return "";
  }
}

// Det, analysen tog fejl af: dine rettelser i udkastet og de vaerdier, Vinteds
// formular ikke kunne tage (tabellen rettelser, sql/012). Laegges ind i
// analysens prompt, saa samme fejl ikke laves igen. Ingen model imellem -
// en rettelse er facit, ikke et moenster, der skal findes.
const FELTNAVN: Record<string, string> = {
  brand: "mærke", size: "størrelse", color: "farve", material: "materiale",
  condition: "stand", category_path: "kategori",
};

export async function hentRettelser(antal = 25): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const noegle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !noegle) return "";
  try {
    const res = await fetch(
      `${url}/rest/v1/rettelser?select=nr,kilde,felt,fra,til&order=tid.desc&limit=${antal}`,
      { headers: { apikey: noegle, authorization: `Bearer ${noegle}` } },
    );
    if (!res.ok) return "";
    const raekker = await res.json() as Array<{ nr: number | null; kilde: string; felt: string; fra: string | null; til: string | null }>;
    if (!raekker.length) return "";
    const dig = raekker.filter((r) => r.kilde === "dig");
    const vinted = raekker.filter((r) => r.kilde === "vinted");
    const nr = (r: { nr: number | null }) => r.nr ? ` (nr. ${r.nr})` : "";
    const ud: string[] = [];
    if (dig.length) {
      ud.push("Sælgeren har tidligere rettet analysen — lær af det, og lav ikke samme fejl igen:\n" +
        dig.map((r) => `- ${FELTNAVN[r.felt] ?? r.felt}: »${r.fra ?? ""}« blev rettet til »${r.til ?? "(tomt)"}«${nr(r)}`).join("\n"));
    }
    if (vinted.length) {
      ud.push("Vinteds formular kunne ikke tage disse værdier — brug Vinteds egne ord:\n" +
        vinted.map((r) => `- ${FELTNAVN[r.felt] ?? r.felt}: »${r.fra ?? ""}«${nr(r)}`).join("\n"));
    }
    return ud.join("\n\n");
  } catch {
    return "";
  }
}
