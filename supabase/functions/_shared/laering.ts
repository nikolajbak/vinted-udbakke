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

// Med "tekst" kommer dine rettelser af titel og beskrivelse med (se
// hentTekstRettelser) - saa faar alle fire tekstskrivere dem: analysen,
// Vinteds markedsrunde, DBA og Reshopper.
export async function hentErfaringer(omraader: Omraade[]): Promise<string> {
  const [erf, tekst] = await Promise.all([
    hentLaerdomme(omraader),
    omraader.includes("tekst") ? hentTekstRettelser() : Promise.resolve(""),
  ]);
  return [erf, tekst].filter(Boolean).join("\n\n");
}

async function hentLaerdomme(omraader: Omraade[]): Promise<string> {
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

// Dine rettelser af titel og beskrivelse (rettelser.felt 'title' og
// 'beskrivelse', skrevet af noterTekstRettelse). En beskrivelse gemmes ikke
// hel: det er saetningerne, du fjernede (fra) og tilfoejede (til), der er
// laeringen. Det fjernede skal ikke skrives igen; det tilfoejede er en slags
// oplysning, sælgeren vil have med - ikke et faktum om en anden vare.
export async function hentTekstRettelser(antal = 20): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const noegle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !noegle) return "";
  try {
    const res = await fetch(
      `${url}/rest/v1/rettelser?select=nr,felt,fra,til&kilde=eq.dig&felt=in.(title,beskrivelse)` +
        `&order=tid.desc&limit=${antal}`,
      { headers: { apikey: noegle, authorization: `Bearer ${noegle}` } },
    );
    if (!res.ok) return "";
    const raekker = await res.json() as Array<{ nr: number | null; felt: string; fra: string | null; til: string | null }>;
    if (!raekker.length) return "";
    const nr = (r: { nr: number | null }) => r.nr ? ` (nr. ${r.nr})` : "";
    const linjer: string[] = [];
    for (const r of raekker) {
      if (r.felt === "title") {
        linjer.push(`- Titel${nr(r)}: »${r.fra ?? ""}« blev rettet til »${r.til ?? ""}«`);
        continue;
      }
      for (const s of delLinjer(r.fra)) linjer.push(`- Fjernet${nr(r)}: »${s}«`);
      for (const s of delLinjer(r.til)) linjer.push(`- Tilføjet${nr(r)}: »${s}«`);
    }
    if (!linjer.length) return "";
    return "Sælgeren har selv rettet annoncetekster. Det er facit — lær af det:\n" +
      "- Det, der er FJERNET, eller noget der ligner, skriver du ikke igen.\n" +
      "- Det, der er TILFØJET, er en slags oplysning eller en formulering, sælgeren vil have med. " +
      "Tag den slags med, når billeder og fakta bærer det for DENNE vare — kopier aldrig fakta fra " +
      "en anden vare.\n" +
      "- Reglerne for annoncetekst går stadig forud.\n" +
      linjer.slice(0, 60).join("\n");
  } catch {
    return "";
  }
}

const delLinjer = (t: string | null) => String(t ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

// Saetningerne i en tekst. Linjeskift og punktum/!/? skiller; sammenligningen
// ser bort fra store/smaa bogstaver og mellemrum.
function saetninger(t: string): string[] {
  return String(t ?? "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 1);
}
const norm = (s: string) => s.toLowerCase().replace(/[\s.!?,;:]+/g, " ").trim();

export function tekstForskel(fra: string, til: string): { fjernet: string[]; tilfoejet: string[] } {
  const a = saetninger(fra), b = saetninger(til);
  const A = new Set(a.map(norm)), B = new Set(b.map(norm));
  return {
    fjernet: a.filter((s) => !B.has(norm(s))),
    tilfoejet: b.filter((s) => !A.has(norm(s))),
  };
}

// Noterer din rettelse af titel og/eller beskrivelse i rettelser. Kun det,
// DU har lavet om: en tekst, modellen har skrevet forfra, er ikke en
// rettelse - appen sender derfor altid den tekst, du startede fra.
export async function noterTekstRettelse(
  draftId: string,
  nr: number | null,
  fra: { title?: string; description?: string },
  til: { title?: string; description?: string },
): Promise<{ fjernet: string[]; tilfoejet: string[]; titel: boolean }> {
  const url = Deno.env.get("SUPABASE_URL");
  const noegle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rk: Array<Record<string, unknown>> = [];
  const titel = !!(fra.title && til.title && norm(fra.title) !== norm(til.title));
  if (titel) rk.push({ draft_id: draftId, nr, kilde: "dig", felt: "title", fra: fra.title, til: til.title });
  const f = tekstForskel(fra.description ?? "", til.description ?? "");
  if (f.fjernet.length || f.tilfoejet.length) {
    rk.push({
      draft_id: draftId, nr, kilde: "dig", felt: "beskrivelse",
      fra: f.fjernet.join("\n").slice(0, 2000) || null,
      til: f.tilfoejet.join("\n").slice(0, 2000) || null,
    });
  }
  if (rk.length && url && noegle) {
    await fetch(`${url}/rest/v1/rettelser`, {
      method: "POST",
      headers: { apikey: noegle, authorization: `Bearer ${noegle}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(rk),
    });
  }
  return { ...f, titel };
}
