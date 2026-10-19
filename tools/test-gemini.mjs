// node --test tools/test-gemini.mjs
// Oversaettelsen mellem Anthropic-kaldene og Gemini (`_shared/gemini-oversaet.ts`).
import test from "node:test";
import assert from "node:assert/strict";
import {
  fraGemini, jsonAf, skemaFejl, rangerModeller, taenkning, tilGemini, UbrugeligtSvar, Uoversaettelig,
} from "../supabase/functions/_shared/gemini-oversaet.ts";

const TOOL = {
  name: "registrer_vare",
  description: "Registrér varen.",
  input_schema: { type: "object", properties: { brand: { type: "string" } }, required: ["brand"] },
};
const VAERKTOEJ = {
  model: "claude-sonnet-5", max_tokens: 1200, system: "Du er sælger.",
  tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
  messages: [{ role: "user", content: [
    { type: "image", source: { type: "url", url: "https://x.supabase.co/storage/v1/object/public/photos/a.jpg" } },
    { type: "text", text: "Hvad er det?" },
  ] }],
};

test("tvunget vaerktoej bliver JSON efter skemaet, billeder som adresse", () => {
  const o = tilGemini(VAERKTOEJ, { model: "gemini-3-flash" });
  assert.equal(o.slags, "vaerktoej");
  assert.deepEqual(o.krop.generationConfig.responseJsonSchema, TOOL.input_schema);
  assert.equal(o.krop.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(o.krop.generationConfig.thinkingConfig, { thinkingLevel: "medium" });
  assert.equal(o.krop.generationConfig.maxOutputTokens, 1200 + 8192);
  assert.deepEqual(o.krop.contents[0].parts[0], {
    file_data: { mime_type: "image/jpeg", file_uri: VAERKTOEJ.messages[0].content[0].source.url },
  });
  assert.match(o.krop.systemInstruction.parts[0].text, /^Du er sælger\.[\s\S]*registrer_vare/);
  assert.deepEqual(o.billeder, [VAERKTOEJ.messages[0].content[0].source.url]);
});

test("billeder som data, skema i prompten, uden taenkning", () => {
  const url = VAERKTOEJ.messages[0].content[0].source.url;
  const o = tilGemini(VAERKTOEJ, {
    model: "gemini-2.5-flash", inline: new Map([[url, { mime: "image/webp", data: "QUJD" }]]),
    udenTaenk: true, skemaIPrompt: true,
  });
  assert.deepEqual(o.krop.contents[0].parts[0], { inline_data: { mime_type: "image/webp", data: "QUJD" } });
  assert.equal(o.krop.generationConfig.responseJsonSchema, undefined);
  assert.equal(o.krop.generationConfig.thinkingConfig, undefined);
  assert.match(o.krop.systemInstruction.parts[0].text, /JSON-skema/);
});

test("soegning bliver google_search + url_context", () => {
  const o = tilGemini({
    model: "claude-haiku-5-5", max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search" }, { type: "web_fetch_20250910", name: "web_fetch" }, TOOL],
    messages: [{ role: "user", content: "Find nyprisen." }],
  }, { model: "gemini-3-flash" });
  assert.equal(o.slags, "soeg");
  assert.deepEqual(o.krop.tools, [{ google_search: {} }, { url_context: {} }]);
  assert.deepEqual(o.krop.generationConfig.thinkingConfig, { thinkingLevel: "low" });
});

test("tekst uden vaerktoej", () => {
  const o = tilGemini({ model: "claude-sonnet-5", max_tokens: 100, messages: [{ role: "user", content: "Ret teksten." }] }, { model: "gemini-3-flash" });
  assert.equal(o.slags, "tekst");
  assert.deepEqual(o.krop.contents[0].parts, [{ text: "Ret teksten." }]);
});

test("flere runder og vaerktoej uden tvang gaar til Claude", () => {
  assert.throws(() => tilGemini({ ...VAERKTOEJ, messages: [...VAERKTOEJ.messages, { role: "assistant", content: [] }] }, { model: "g" }), Uoversaettelig);
  assert.throws(() => tilGemini({ ...VAERKTOEJ, tool_choice: { type: "auto" } }, { model: "g" }), Uoversaettelig);
});

const svar = (text, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text: "tanke", thought: true }, { text }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 },
});

test("svaret bliver et tool_use, tanker regnes med i forbruget", () => {
  const o = tilGemini(VAERKTOEJ, { model: "gemini-3-flash" });
  const d = fraGemini(svar('{"brand":"Nike"}'), o, "gemini-3-flash");
  assert.deepEqual(d.content, [{ type: "tool_use", id: d.content[0].id, name: "registrer_vare", input: { brand: "Nike" } }]);
  assert.equal(d.usage.output_tokens, 50);
  assert.equal(d.model, "gemini-3-flash");
});

test("ubrugelige svar kaster", () => {
  const o = tilGemini(VAERKTOEJ, { model: "gemini-3-flash" });
  assert.throws(() => fraGemini(svar('{"brand":"Nike"}', "MAX_TOKENS"), o, "m"), UbrugeligtSvar);
  assert.throws(() => fraGemini(svar('{"farve":"sort"}'), o, "m"), /mangler brand/);
  assert.throws(() => fraGemini(svar("ved ikke"), o, "m"), UbrugeligtSvar);
  assert.throws(() => fraGemini({ promptFeedback: { blockReason: "SAFETY" } }, o, "m"), /SAFETY/);
});

test("indpakket i vaerktoejets navn og i ```json", () => {
  const o = tilGemini(VAERKTOEJ, { model: "gemini-3-flash" });
  assert.deepEqual(fraGemini(svar('```json\n{"registrer_vare":{"brand":"H&M"}}\n```'), o, "m").content[0].input, { brand: "H&M" });
  assert.deepEqual(jsonAf('Her: {"a":1} tak'), { a: 1 });
});

test("modellerne: nyeste flash foerst, ingen lite/pro/preview-dubletter foran", () => {
  assert.deepEqual(rangerModeller([
    "models/gemini-2.5-flash", "models/gemini-2.5-flash-lite", "models/gemini-3-flash-preview",
    "models/gemini-2.5-pro", "models/gemini-3.1-flash", "models/gemini-2.0-flash", "models/gemini-2.5-flash-image",
  ]), ["gemini-3.1-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]);
  assert.equal(taenkning("claude-sonnet-5", "gemini-2.5-flash").thinkingBudget, 4096);
  assert.equal(taenkning("claude-haiku-5-5", "gemini-2.0-flash"), undefined);
});

test("skemaet haandhaeves: type, enum, indlejret, null", () => {
  const sk = { type: "object", required: ["a", "b"], properties: {
    a: { type: ["integer", "null"] }, b: { type: "array", items: { type: "object", required: ["x"], properties: { x: { type: "string", enum: ["S/M/L", "EU"] } } } },
  } };
  assert.equal(skemaFejl({ a: null, b: [{ x: "EU" }] }, sk), undefined);
  assert.match(skemaFejl({ a: 1.5, b: [] }, sk), /a er ikke/);
  assert.match(skemaFejl({ a: 1, b: "[]" }, sk), /b er ikke array/);
  assert.match(skemaFejl({ a: 1, b: [{}] }, sk), /mangler b\[0\]\.x/);
  assert.match(skemaFejl({ a: 1, b: [{ x: "XL" }] }, sk), /ikke i listen/);
});
