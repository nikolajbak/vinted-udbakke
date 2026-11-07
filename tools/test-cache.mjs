// node --test tools/test-cache.mjs
// Cachemaerket paa systemprompten (`_shared/prompt-cache.ts`).
import test from "node:test";
import assert from "node:assert/strict";
import { CACHE_TRIN, medCache } from "../supabase/functions/_shared/prompt-cache.ts";
import { tilGemini, Uoversaettelig } from "../supabase/functions/_shared/gemini-oversaet.ts";

const TOOL = { name: "saet_ny_pris", description: "x", input_schema: { type: "object", properties: {} } };
const KALD = {
  model: "claude-sonnet-5", max_tokens: 100, system: "Du er sælger.", tools: [TOOL],
  tool_choice: { type: "tool", name: TOOL.name },
  messages: [{ role: "user", content: "Varen" }],
};

test("et udvalgt trin faar maerket paa systemprompten og intet andet sted", () => {
  const ud = medCache(KALD, "vinted:saet_ny_pris");
  assert.deepEqual(ud.system, [{ type: "text", text: "Du er sælger.", cache_control: { type: "ephemeral" } }]);
  assert.deepEqual(ud.messages, KALD.messages);
  assert.deepEqual(ud.tools, KALD.tools);
  assert.equal("cache_control" in ud, false);
});

test("et trin uden for listen er uroert", () => {
  assert.equal(medCache(KALD, "laering"), KALD);
  assert.equal(CACHE_TRIN.has("laering"), false);
});

test("opslag med soegning er ikke med: serveren indsaetter selv cacheskrivninger", () => {
  assert.equal(CACHE_TRIN.has("opslag:nypris_maal"), false);
  assert.equal(CACHE_TRIN.has("dba:marked"), false);
});

test("uden tekst i system er kaldet uroert", () => {
  const liste = { ...KALD, system: [{ type: "text", text: "x" }] };
  assert.equal(medCache(liste, "vinted:saet_ny_pris"), liste);
  const uden = { ...KALD, system: undefined };
  assert.equal(medCache(uden, "vinted:saet_ny_pris"), uden);
});

test("kaldet, Gemini faar, er uden maerke — ellers ville trinnet stille gaa til Claude", () => {
  const foer = JSON.stringify(KALD);
  medCache(KALD, "vinted:saet_ny_pris");
  assert.equal(JSON.stringify(KALD), foer);
  assert.doesNotThrow(() => tilGemini(KALD, { model: "gemini-3-flash" }));
  assert.throws(() => tilGemini(medCache(KALD, "vinted:saet_ny_pris"), { model: "gemini-3-flash" }), Uoversaettelig);
});
