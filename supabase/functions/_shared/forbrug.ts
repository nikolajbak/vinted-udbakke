// Hvad hvert modelkald koster, gemt i `forbrug` (sql/013-forbrug.sql).
//
// Der fandtes intet tal for, hvad appen koster: koden smed svarets `usage`
// vaek, og der er ingen Admin-noegle til Anthropics forbrugsrapport. Et skoen
// ud fra koden (8. oktober) gav ~$0,45 pr. vare med fotoene som 70 % af det,
// men med tekstprompternes laengde gaettet. Her gemmes det maalte.
//
// Prisen regnes med det samme, men tokens gemmes ogsaa raa, saa den kan regnes
// om, hvis prislisten aendrer sig. Fejler noteringen, gaar kaldet videre:
// et tal i en tabel maa aldrig vaelte en analyse.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// $ pr. million tokens: [input, output]. Cache-skrivning koster 1,25 x input,
// cache-laesning 0,1 x. Laengste navn foerst, saa "claude-sonnet-5-5" ikke
// fanges af "claude-sonnet-5".
const PRIS: Array<[string, number, number]> = [
  ["claude-sonnet-5-5", 2, 10],
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-haiku-4-5", 1, 5],
  ["claude-opus-5-5", 4, 20],
  ["claude-sonnet-5", 2, 10],
];
const PR_SOEGNING = 0.01; // web search: $10 pr. 1000

// deno-lint-ignore no-explicit-any
export function noterForbrug(svar: any, trin: string, draftId?: unknown): Promise<void> {
  const p = (async () => {
    try {
      const u = svar?.usage;
      if (!u || !SUPABASE_URL || !SERVICE_ROLE_KEY) return;
      const model = String(svar?.model ?? "");
      const ind = Number(u.input_tokens ?? 0);
      const ud = Number(u.output_tokens ?? 0);
      const cacheSkriv = Number(u.cache_creation_input_tokens ?? 0);
      const cacheLaes = Number(u.cache_read_input_tokens ?? 0);
      const soegninger = Number(u.server_tool_use?.web_search_requests ?? 0);
      const pris = PRIS.find(([navn]) => model.startsWith(navn));
      const usd = pris
        ? (ind * pris[1] + cacheSkriv * pris[1] * 1.25 + cacheLaes * pris[1] * 0.1 + ud * pris[2]) / 1e6 +
          soegninger * PR_SOEGNING
        : null;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/forbrug`, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          draft_id: typeof draftId === "string" && draftId ? draftId : null,
          trin,
          model,
          input_tokens: ind,
          output_tokens: ud,
          cache_skriv: cacheSkriv,
          cache_laes: cacheLaes,
          soegninger,
          usd,
        }),
      });
      if (!res.ok) console.error("forbrug ikke noteret", res.status, (await res.text()).slice(0, 200));
    } catch (err) {
      console.error("forbrug ikke noteret", err);
    }
  })();
  // Svaret skal ikke vente paa noteringen; waitUntil holder funktionen i live,
  // til den er skrevet. Uden den ventes der.
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(p);
    return Promise.resolve();
  }
  return p;
}
