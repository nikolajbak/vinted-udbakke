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
