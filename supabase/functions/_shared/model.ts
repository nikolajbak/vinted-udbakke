// Hvert modelkald gaar herigennem: Gemini (gratisniveauet) foerst, hvor
// `modelvalg` siger det, og Claude som reserve, saa kvaliteten aldrig falder
// under det, appen havde. Kaldestedet sender det samme Anthropic-kald som
// foer og faar et svar i Anthropics form tilbage — prompter, vaerktoejer og
// laesningen af svaret er uroerte.
//
// `modelvalg` (sql/022-gemini.sql) styrer hvert trin uden en ny udgivelse:
//   claude  — kun Claude (som foer)
//   skygge  — Claude bruges; Gemini koerer ved siden af, og begge svar
//             gemmes i `modelkald`, saa de kan sammenlignes paa rigtige varer
//   gemini  — Gemini bruges; et fejlet eller ubrugeligt svar gaar til Claude
// Opslaget: trinnet selv (»analyse:registrer_vare«), saa delen foer kolon
// (»analyse«), saa »*«. Kan tabellen ikke laeses, er svaret »claude«.

// deno-lint-ignore-file no-explicit-any

import {
  fraGemini,
  mimeAf,
  rangerModeller,
  tilGemini,
  Uoversaettelig,
  type Oversat,
} from "./gemini-oversaet.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const G = "https://generativelanguage.googleapis.com/v1beta";

type Valg = "claude" | "skygge" | "gemini";

let valgCache: { tid: number; rk: Map<string, Valg> } | null = null;
async function valgFor(trin: string): Promise<Valg> {
  if (!GEMINI_API_KEY || !SUPABASE_URL) return "claude";
  if (!valgCache || Date.now() - valgCache.tid > 60_000) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/modelvalg?select=trin,valg`, {
        headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        signal: AbortSignal.timeout(3000),
      });
      const rk = new Map<string, Valg>();
      if (r.ok) for (const x of await r.json()) rk.set(String(x.trin), x.valg as Valg);
      valgCache = { tid: Date.now(), rk };
    } catch {
      valgCache = { tid: Date.now(), rk: new Map() };
    }
  }
  const rk = valgCache.rk;
  return rk.get(trin) ?? rk.get(trin.split(":")[0]) ?? rk.get("*") ?? "claude";
}

// Modellisten hentes én gang pr. isolat. Model i karantaene (429/5xx) i et
// minut, 404 i en time.
let modelListe: { tid: number; liste: string[] } | null = null;
const karantaene = new Map<string, number>();
async function modeller(): Promise<string[]> {
  if (!modelListe || Date.now() - modelListe.tid > 3_600_000) {
    try {
      const r = await fetch(`${G}/models?pageSize=200`, {
        headers: { "x-goog-api-key": GEMINI_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      const d = r.ok ? await r.json() : {};
      const navne = (d.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: any) => String(m.name));
      const liste = rangerModeller(navne);
      if (liste.length) modelListe = { tid: Date.now(), liste };
    } catch (err) {
      console.error("gemini: modellisten kunne ikke hentes", err);
    }
  }
  const nu = Date.now();
  return (modelListe?.liste ?? ["gemini-2.5-flash"]).filter((m) => !((karantaene.get(m) ?? 0) > nu));
}

// Kan Gemini ikke selv hente et billede, hentes det her og sendes som data.
// Supabases egne billeder i en mindre udgave (1600 px er rigeligt for
// modellen og sparer CPU paa base64).
function mindre(url: string): string {
  const m = url.match(/^(https:\/\/[^/]+\.supabase\.co)\/storage\/v1\/object\/public\/(.+)$/);
  return m ? `${m[1]}/storage/v1/render/image/public/${m[2].split("?")[0]}?width=1600&height=1600&resize=contain` : url;
}
function base64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
async function hentBilleder(urls: string[], frist: AbortSignal): Promise<Map<string, { mime: string; data: string }>> {
  const ud = new Map<string, { mime: string; data: string }>();
  await Promise.all([...new Set(urls)].map(async (u) => {
    const r = await fetch(mindre(u), { signal: AbortSignal.any([frist, AbortSignal.timeout(8000)]) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) throw new Error(`billede ${r.status} ${u.slice(0, 80)}`);
    ud.set(u, { mime: type.split(";")[0] || mimeAf(u), data: base64(new Uint8Array(await r.arrayBuffer())) });
  }));
  return ud;
}
// Laeres pr. isolat: tager Gemini billedadresser direkte?
let adresserVirker = true;

class GeminiFejl extends Error {
  constructor(public status: number, public rod: string) { super(`gemini ${status}: ${rod.slice(0, 200)}`); }
}

async function etKald(model: string, body: any, opt: { inline?: Map<string, any>; udenTaenk?: boolean; skemaIPrompt?: boolean }, frist: AbortSignal) {
  const o: Oversat = tilGemini(body, { model, ...opt });
  const r = await fetch(`${G}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify(o.krop),
    signal: frist,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new GeminiFejl(r.status, String(d?.error?.message ?? ""));
  const data = fraGemini(d, o, model);
  if (o.slags === "soeg") await udenOmvej(data.content[0].input, frist);
  return { data, o };
}

// Googles soegning giver adresser som vertexaisearch.cloud.google.com/
// grounding-api-redirect/…, og modellen skriver dem gerne af. Produktsiden
// skal vaere butikkens egen adresse.
async function udenOmvej(input: Record<string, unknown>, frist: AbortSignal) {
  for (const [k, v] of Object.entries(input)) {
    if (typeof v !== "string" || !/grounding-api-redirect/.test(v)) continue;
    try {
      const r = await fetch(v, { redirect: "manual", signal: AbortSignal.any([frist, AbortSignal.timeout(4000)]) });
      await r.body?.cancel();
      const til = r.headers.get("location");
      input[k] = til && /^https?:\/\//.test(til) ? til : null;
    } catch {
      input[k] = null;
    }
  }
}

// Én model, med de omveje en 400 kan kraeve: billederne som data, uden
// taenkefelt, skemaet i prompten. Hver omvej proeves én gang.
async function enModel(model: string, body: any, frist: AbortSignal) {
  const opt: { inline?: Map<string, any>; udenTaenk?: boolean; skemaIPrompt?: boolean } = {};
  const urls = tilGemini(body, { model }).billeder;
  // Flaget gaelder kun appens egne billeder: en doed butiksadresse blandt
  // producentbillederne siger intet om, hvorvidt Gemini kan hente adresser.
  const egne = urls.length > 0 && urls.every((u) => /\.supabase\.co\/storage\//.test(u));
  if (!adresserVirker && egne) opt.inline = await hentBilleder(urls, frist);
  for (let forsoeg = 0; forsoeg < 4; forsoeg++) {
    try {
      return await etKald(model, body, opt, frist);
    } catch (e) {
      if (!(e instanceof GeminiFejl) || e.status !== 400) throw e;
      if (urls.length && !opt.inline && /file|uri|url|fetch|download|image/i.test(e.rod)) {
        if (egne) adresserVirker = false;
        opt.inline = await hentBilleder(urls, frist);
      } else if (!opt.udenTaenk && /think/i.test(e.rod)) {
        opt.udenTaenk = true;
      } else if (!opt.skemaIPrompt && /schema|response_?json|mime|tool/i.test(e.rod)) {
        opt.skemaIPrompt = true;
      } else throw e;
    }
  }
  throw new Error("gemini: for mange omveje");
}

// Gemini paa skift: en model i karantaene springes over, og en
// overbelastet model giver plads til den naeste. Soegninger faar én model —
// runneren venter 90 s paa hele opslaget, og Claude skal kunne naa det.
async function gemini(body: any, trin: string, draft_id: string | null, ms: number): Promise<{ data: any; model: string; ms: number }> {
  // Én frist for hele Gemini-delen, saa Claude altid naar at svare bagefter.
  const frist = AbortSignal.timeout(ms);
  const soeg = (body.tools ?? []).some((t: any) => /^web_/.test(String(t?.type ?? "")));
  const liste = (await modeller()).slice(0, soeg ? 1 : 2);
  if (!liste.length) throw new Error("ingen Gemini-model ledig");
  let sidste: unknown;
  for (const model of liste) {
    const t0 = Date.now();
    try {
      const { data } = await enModel(model, body, frist);
      return { data, model, ms: Date.now() - t0 };
    } catch (e) {
      sidste = e;
      const s = e instanceof GeminiFejl ? e.status : 0;
      // 403 (»API has not been used in project … or it is disabled«, set
      // paa gemini-3.8-flash 19. oktober, mens 3.7 svarede) som 404.
      if (s === 404 || s === 403) karantaene.set(model, Date.now() + 3_600_000);
      else if (s === 429 || s >= 500 || (e as Error)?.name === "TimeoutError") karantaene.set(model, Date.now() + 60_000);
      iBaggrunden(noter({ trin, draft_id, model, ok: false, ms: Date.now() - t0, fejl: String((e as Error)?.message ?? e).slice(0, 500) }));
      if (frist.aborted) break;
    }
  }
  throw sidste;
}

function svarAf(data: any): unknown {
  const c = data?.content ?? [];
  const v = c.find((b: any) => b?.type === "tool_use");
  if (v) return v.input;
  return c.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").slice(0, 8000);
}

function noter(r: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return Promise.resolve();
  return fetch(`${SUPABASE_URL}/rest/v1/modelkald`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(r),
  }).then(async (res) => {
    if (!res.ok) console.error("modelkald ikke noteret", res.status, (await res.text()).slice(0, 200));
  }, (err) => console.error("modelkald ikke noteret", err));
}

function iBaggrunden(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

function claude(body: any, apiKey: string, signal?: AbortSignal): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
}

export interface KaldValg {
  trin: string;
  draftId?: unknown;
  signal?: AbortSignal;
  apiKey?: string;
  // Hoejst saa laenge pr. Gemini-forsoeg (standard 40 s). Et kald med en
  // kort frist (vaelgBilleder: 20 s) skal give Claude tid til at svare.
  geminiMs?: number;
}

// Som fetch til Anthropic: et Response med Anthropics JSON. `trin` er det
// samme navn, kaldestedet giver noterForbrug.
export async function modelKald(body: any, v: KaldValg): Promise<Response> {
  const apiKey = v.apiKey || ANTHROPIC_API_KEY;
  const draft_id = typeof v.draftId === "string" && v.draftId ? v.draftId : null;
  let valg = await valgFor(v.trin);
  // Hele Gemini-delen (alle modeller og omveje) skal vaere faerdig inden for
  // denne frist, ellers gaar kaldet til Claude.
  const ms = v.geminiMs ?? 40_000;
  if (valg !== "claude") {
    try { tilGemini(body, { model: "gemini" }); } catch (e) {
      if (!(e instanceof Uoversaettelig)) throw e;
      valg = "claude"; // fx opslagets pause_turn-runder
    }
  }

  if (valg === "gemini") {
    try {
      const g = await gemini(body, v.trin, draft_id, ms);
      iBaggrunden(noter({ trin: v.trin, draft_id, model: g.model, ok: true, ms: g.ms, gemini_svar: svarAf(g.data) }));
      return new Response(JSON.stringify(g.data), { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
      {
        console.error(`gemini ${v.trin}: til Claude`, String((e as Error)?.message ?? e).slice(0, 200));
      }
    }
    return claude(body, apiKey, v.signal);
  }

  const res = await claude(body, apiKey, v.signal);
  if (valg === "skygge" && res.ok) {
    const kopi = res.clone();
    iBaggrunden((async () => {
      try {
        const [c, g] = await Promise.all([kopi.json(), gemini(body, v.trin, draft_id, ms)]);
        await noter({
          trin: v.trin, draft_id, model: g.model, ok: true, ms: g.ms, skygge: true,
          gemini_svar: svarAf(g.data), claude_svar: svarAf(c),
        });
      } catch { /* fejlen er noteret i gemini() */ }
    })());
  }
  return res;
}
