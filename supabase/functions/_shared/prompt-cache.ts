// Prompt-cachen hos Anthropic: de trin, hvor systemprompten og vaerktoejet er
// ens fra kald til kald, og kaldene kommer inden for cachens 5 minutter.
// Maerket saettes kun paa kaldet til Claude (`claude()` i model.ts): `tilGemini`
// afviser `cache_control`, saa et maerke ved kaldestedet ville stille sende
// trinnet til Claude og slukke skyggen.
//
// Et trin uden gentagelser kommer ikke med: en skrivning koster 1,25 x, og
// skrives der uden at blive laest, bliver kaldet dyrere (`laering`: kun 6 % af
// kaldene inden for 5 minutter). Soegninger er heller ikke med
// (`opslag:nypris_maal`, `dba:marked`): serveren indsaetter selv
// cacheskrivninger efter soegeresultaterne, naar et kald bruger cachen.

// deno-lint-ignore-file no-explicit-any

export const CACHE_TRIN: ReadonlySet<string> = new Set([
  "vinted:saet_ny_pris",
  "analyse:vurder_billede",
  "analyse:registrer_vare",
  "analyse:skriv_annonce",
  "vinted:skriv_annonce",
]);

export function medCache(body: any, trin: string): any {
  if (!CACHE_TRIN.has(trin) || typeof body?.system !== "string" || !body.system) return body;
  return { ...body, system: [{ type: "text", text: body.system, cache_control: { type: "ephemeral" } }] };
}
