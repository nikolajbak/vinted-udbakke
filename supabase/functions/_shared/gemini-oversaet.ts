// Oversaetter et Anthropic-kald til Gemini og Geminis svar tilbage, saa hvert
// kaldested beholder sin prompt, sit vaerktoej og sin laesning af svaret.
// Ren kode uden Deno: testet med `node --test tools/test-gemini.mjs`.
//
// Tre slags kald findes i appen, og kun de tre oversaettes:
//  - tvunget vaerktoej (tool_choice type tool)  -> JSON efter vaerktoejets skema
//  - web_search/web_fetch + et svarvaerktoej     -> google_search + url_context
//  - ren tekst (ingen vaerktoejer)               -> tekst
// Alt andet (assistant-runder med tool_use, cache_control ...) er
// `Uoversaettelig` og gaar til Claude som foer.

// deno-lint-ignore-file no-explicit-any

export class Uoversaettelig extends Error {}

export type Slags = "vaerktoej" | "soeg" | "tekst";

export interface Oversat {
  krop: Record<string, unknown>;
  slags: Slags;
  vaerktoej?: { name: string; input_schema: Record<string, unknown> };
  billeder: string[];
}

export interface Valg {
  model: string;
  // Billeder lagt ind som data i stedet for som adresse (url -> {mime, data}).
  inline?: Map<string, { mime: string; data: string }>;
  udenTaenk?: boolean;
  // Skemaet skrives i prompten i stedet for i responseJsonSchema.
  skemaIPrompt?: boolean;
}

export function mimeAf(url: string): string {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".gif")) return "image/gif";
  if (u.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}

export function version(model: string): number {
  const m = model.match(/^gemini-(\d+(?:\.\d+)?)-/);
  return m ? parseFloat(m[1]) : 0;
}

// Claude-modellens niveau styrer, hvor meget Gemini maa taenke. Gemini 3 har
// trin, 2.5 et budget; aeldre modeller og lite-modellerne faar intet felt
// (Kalorietaeller: de afviser det).
export function taenkning(claudeModel: string, model: string): Record<string, unknown> | undefined {
  const let_ = /haiku/.test(claudeModel);
  const v = version(model);
  if (/lite/.test(model)) return undefined;
  if (v >= 3) return { thinkingLevel: let_ ? "low" : "medium" };
  if (v >= 2.5) return { thinkingBudget: let_ ? 1024 : 4096 };
  return undefined;
}

function del(b: any, valg: Valg, billeder: string[]): any {
  if (b?.type === "text") return { text: String(b.text ?? "") };
  if (b?.type === "image") {
    const s = b.source ?? {};
    if (s.type === "base64") return { inline_data: { mime_type: s.media_type || "image/jpeg", data: s.data } };
    if (s.type === "url" && typeof s.url === "string") {
      billeder.push(s.url);
      const i = valg.inline?.get(s.url);
      if (i) return { inline_data: { mime_type: i.mime, data: i.data } };
      return { file_data: { mime_type: mimeAf(s.url), file_uri: s.url } };
    }
  }
  throw new Uoversaettelig(`indhold af typen ${b?.type}`);
}

function indhold(c: any, valg: Valg, billeder: string[]): any[] {
  if (typeof c === "string") return [{ text: c }];
  if (Array.isArray(c)) return c.map((b) => del(b, valg, billeder));
  throw new Uoversaettelig("ukendt indhold");
}

export function tilGemini(body: any, valg: Valg): Oversat {
  if (JSON.stringify(body).includes("cache_control")) throw new Uoversaettelig("cache_control");
  const msgs: any[] = body?.messages ?? [];
  // Kun ét brugerindlaeg: opslagets pause_turn-runder baerer tool_use-blokke.
  if (msgs.length !== 1 || msgs[0]?.role !== "user") throw new Uoversaettelig("flere runder");

  const tools: any[] = body.tools ?? [];
  const server = tools.filter((t) => typeof t?.type === "string" && /^web_(search|fetch)_/.test(t.type));
  const egne = tools.filter((t) => t?.input_schema);
  if (tools.length !== server.length + egne.length) throw new Uoversaettelig("ukendt vaerktoej");

  let slags: Slags;
  let vaerktoej: Oversat["vaerktoej"];
  if (server.length) {
    if (egne.length !== 1) throw new Uoversaettelig("soegning uden ét svarvaerktoej");
    slags = "soeg";
    vaerktoej = egne[0];
  } else if (egne.length) {
    const tc = body.tool_choice;
    if (egne.length !== 1 || tc?.type !== "tool" || tc?.name !== egne[0].name) {
      throw new Uoversaettelig("vaerktoej uden tvang");
    }
    slags = "vaerktoej";
    vaerktoej = egne[0];
  } else {
    slags = "tekst";
  }

  const billeder: string[] = [];
  const dele = indhold(msgs[0].content, valg, billeder);
  let system = typeof body.system === "string" ? body.system
    : Array.isArray(body.system) ? body.system.map((b: any) => b?.text ?? "").join("\n") : "";

  const skema = vaerktoej?.input_schema;
  const iPrompt = !!skema && (valg.skemaIPrompt || false);
  if (vaerktoej) {
    const besked = `Svar KUN med ét JSON-objekt — det er input til værktøjet »${vaerktoej.name}«` +
      ((vaerktoej as any).description ? ` (${(vaerktoej as any).description})` : "") + ".";
    // I soegningen er svarvaerktoejet det, Claude »kalder til sidst«; her er
    // det selve svaret.
    const ord = slags === "soeg"
      ? `Når prompten siger, at du skal kalde ${vaerktoej.name}, så er det dit svar: ${besked}`
      : besked;
    system = [system, ord, iPrompt ? `JSON-skema:\n${JSON.stringify(skema)}` : ""].filter(Boolean).join("\n\n");
  }

  const max = Math.min(65536, Number(body.max_tokens ?? 1200) + 8192);
  const conf: Record<string, unknown> = { maxOutputTokens: max };
  if (vaerktoej && !iPrompt) {
    conf.responseMimeType = "application/json";
    conf.responseJsonSchema = skema;
  } else if (vaerktoej && slags === "vaerktoej") {
    conf.responseMimeType = "application/json";
  }
  const t = valg.udenTaenk ? undefined : taenkning(String(body.model ?? ""), valg.model);
  if (t) conf.thinkingConfig = t;

  const krop: Record<string, unknown> = {
    contents: [{ role: "user", parts: dele }],
    generationConfig: conf,
    // Koebernes beskeder og mailene er hverdagssprog, men standardfilteret
    // kan tage et bud eller en klage for chikane (Kalorietaeller).
    safetySettings: [
      "HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT",
    ].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })),
  };
  if (system) krop.systemInstruction = { parts: [{ text: system }] };
  if (slags === "soeg") {
    const navne = server.map((t) => t.type as string);
    const v: any[] = [];
    if (navne.some((n) => n.startsWith("web_search"))) v.push({ google_search: {} });
    if (navne.some((n) => n.startsWith("web_fetch"))) v.push({ url_context: {} });
    krop.tools = v;
  }
  return { krop, slags, vaerktoej, billeder };
}

// Det foerste JSON-objekt i en tekst — en model uden skema pakker det gerne i
// ```json ... ```.
export function jsonAf(tekst: string): any {
  const t = tekst.trim();
  try { return JSON.parse(t); } catch { /* videre */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* videre */ } }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* videre */ } }
  return undefined;
}

export class UbrugeligtSvar extends Error {}

// Geminis svar som et Anthropic-svar. Et svar, der ikke kan bruges (afskaaret,
// blokeret, forkert JSON, manglende felter), kaster UbrugeligtSvar, saa
// kaldet gaar til naeste model eller til Claude.
export function fraGemini(d: any, o: Oversat, model: string): any {
  const k = d?.candidates?.[0];
  const grund = String(k?.finishReason ?? "");
  if (!k || (grund && grund !== "STOP")) {
    throw new UbrugeligtSvar(`slut: ${grund || d?.promptFeedback?.blockReason || "intet svar"}`);
  }
  const tekst = (k.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("");
  const u = d.usageMetadata ?? {};
  const usage = {
    input_tokens: Number(u.promptTokenCount ?? 0) + Number(u.toolUsePromptTokenCount ?? 0),
    output_tokens: Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0),
    server_tool_use: { web_search_requests: 0 },
  };
  const base = { id: d.responseId ?? "", type: "message", role: "assistant", model, usage, stop_reason: "end_turn" };
  if (o.slags === "tekst") {
    if (!tekst.trim()) throw new UbrugeligtSvar("tom tekst");
    return { ...base, content: [{ type: "text", text: tekst }] };
  }
  let input = jsonAf(tekst);
  // Svarvaerktoejet pakket ind i sit eget navn: {"angiv_fund": {...}}.
  const navn = o.vaerktoej!.name;
  if (input && typeof input === "object" && Object.keys(input).length === 1 && input[navn] && typeof input[navn] === "object") {
    input = input[navn];
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new UbrugeligtSvar("ikke et JSON-objekt");
  const fejl = skemaFejl(input, o.vaerktoej!.input_schema);
  if (fejl) throw new UbrugeligtSvar(fejl);
  return {
    ...base,
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: `gemini_${Date.now()}`, name: navn, input }],
  };
}

// Svaret holdt op mod vaerktoejets skema: type, enum, paakraevede felter,
// ogsaa indlejret. Claude haandhaever skemaet selv; uden denne kontrol ville
// et Gemini-svar med fx en tekst i stedet for en liste vaelte kaldestedet i
// stedet for at gaa til Claude. Ukendte noegleord springes over.
export function skemaFejl(v: any, sk: any, sti = "svar"): string | undefined {
  if (!sk || typeof sk !== "object") return undefined;
  const typer: string[] = sk.type === undefined ? [] : Array.isArray(sk.type) ? sk.type : [sk.type];
  const passer = (t: string) =>
    t === "null" ? v === null
    : t === "string" ? typeof v === "string"
    : t === "boolean" ? typeof v === "boolean"
    : t === "number" ? typeof v === "number" && Number.isFinite(v)
    : t === "integer" ? Number.isInteger(v)
    : t === "array" ? Array.isArray(v)
    : t === "object" ? !!v && typeof v === "object" && !Array.isArray(v)
    : true;
  if (typer.length && !typer.some(passer)) return `${sti} er ikke ${typer.join("/")}`;
  if (Array.isArray(sk.enum) && v !== null && !sk.enum.includes(v)) return `${sti} ikke i listen`;
  if (Array.isArray(sk.anyOf) && !sk.anyOf.some((s: any) => !skemaFejl(v, s, sti))) return `${sti} passer ikke`;
  if (Array.isArray(v) && sk.items) {
    for (let i = 0; i < v.length; i++) {
      const f = skemaFejl(v[i], sk.items, `${sti}[${i}]`);
      if (f) return f;
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const f of sk.required ?? []) if (!(f in v)) return `mangler ${sti === "svar" ? "" : sti + "."}${f}`;
    for (const [k, s] of Object.entries(sk.properties ?? {})) {
      if (k in v) {
        const f = skemaFejl(v[k], s, sti === "svar" ? k : `${sti}.${k}`);
        if (f) return f;
      }
    }
  }
  return undefined;
}

// Modellerne, der er kloge nok til appens arbejde: nyeste Flash foerst
// (Kalorietaeller: hurtig nok, stoerst gratiskvote). Preview tael lidt mindre,
// lite og Pro er ikke med — lite er for svag til billederne, Pro har ingen
// gratiskvote at tale om.
export function rangerModeller(navne: string[]): string[] {
  const ok = navne.map((n) => n.replace(/^models\//, "")).filter((n) =>
    /^gemini-\d/.test(n) && /flash/.test(n) && !/lite/.test(n) &&
    !/image|tts|audio|live|embedding|robotics|computer|customtools|latest|exp|thinking|8b/.test(n) &&
    version(n) >= 2.5
  );
  const vaerdi = (n: string) => version(n) - (/preview/.test(n) ? 0.3 : 0);
  return [...new Set(ok)].sort((a, b) => vaerdi(b) - vaerdi(a) || a.length - b.length);
}
