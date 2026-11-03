// Klientnoeglen (SHORTCUT_KEY) staar i installerede brugerscripter og
// bogmaerker, og appen henter den efter login (klientnoegle(), sql/030).
// Skiftes den med tools/skift-noegle.sh, virker den gamle videre til
// SHORTCUT_KEY_GAMMEL_TIL, saa intet staar af, foer telefonen og Macen har
// installeret igen fra appen. Imens viser runneren et baand om det (varsel).
const NY = Deno.env.get("SHORTCUT_KEY") ?? "";
const GAMMEL = Deno.env.get("SHORTCUT_KEY_GAMMEL") ?? "";
const TIL = Date.parse(Deno.env.get("SHORTCUT_KEY_GAMMEL_TIL") ?? "");

export type Noegle = "ny" | "gammel" | null;

export function klientNoegle(url: URL): Noegle {
  const k = url.searchParams.get("key") ?? "";
  if (NY && k === NY) return "ny";
  // NaN fra en manglende dato goer sammenligningen falsk.
  if (GAMMEL && k === GAMMEL && Date.now() < TIL) return "gammel";
  return null;
}
