// Oversaetter en faerdig annonce til Reshoppers egne felter.
//
// Reshopper opretter kun varer fra deres app - der er ingen webformular at
// udfylde, og deres API er ikke udgivet. Indtil det aendrer sig, er det bedste
// vi kan goere at laegge annoncen faerdig i DERES ordlyd og raekkefoelge, saa
// indtastningen bliver ren afskrift.
//
// Feltnavne og vaerdier er hentet fra app-bundlens egen specifikation
// (swagger.json), ikke gaettet.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

function clean(v: unknown): string {
  return String(v ?? "").replace(/<[^>]*>/g, "").trim();
}

// Reshoppers egne vaerdier. Enum'erne staar saadan i deres specifikation.
const TOOL = {
  name: "oversaet_til_reshopper",
  description: "Læg annoncen over i Reshoppers felter.",
  input_schema: {
    type: "object",
    properties: {
      segment: { type: "string", enum: ["kids", "women", "home"] },
      category: {
        type: "string",
        enum: ["shoes", "clothes", "toys", "gear", "furniture", "garden", "bikes",
               "booksAndMedia", "maternity", "misc", "accessories", "interior"],
      },
      conditionType: {
        type: "string",
        enum: ["brandNew", "new", "used", "broken"],
        description:
          'brandNew = ny med prismærke. new = ubrugt uden mærke. used = brugt. ' +
          'broken = defekt. Kan man SE en plet eller et hul på billederne, er det "used", aldrig "new".',
      },
      brandOrTitle: {
        type: "string",
        description: "Mærket hvis der er et, ellers en kort varebetegnelse. Det er dét, købere søger på.",
      },
      age: {
        type: "string",
        description: 'Alder som Reshopper skriver den for børnetøj, fx "6-7 år". Tom streng hvis varen ikke er til børn.',
      },
      size: { type: "string", description: 'Størrelsen som på etiketten, fx "120". Tom streng hvis uden størrelse.' },
      gender: { type: "string", description: '"boy", "girl" eller tom streng hvis varen er neutral.' },
      description: {
        type: "string",
        description:
          "Kort overskriftslinje på dansk — det første en køber ser. Ikke en gentagelse af mærket alene.",
      },
      extendedDescription: {
        type: "string",
        description:
          "Den fulde beskrivelse på dansk, 3-6 linjer. Reshopper er et forældre-til-forældre-marked: " +
          "skriv ligefremt og konkret om stand, pasform og eventuelle fejl. Ingen sælger-sprog.",
      },
    },
    required: ["segment", "category", "conditionType", "brandOrTitle", "age", "size",
               "gender", "description", "extendedDescription"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) return json({ error: "unauthorized" }, 401);

  let id = "";
  try { id = (await req.json()).id; } catch { /* ignoreres */ }
  if (!id) return json({ error: "missing_id" }, 400);

  const { data: d, error } = await supabase
    .from("drafts")
    .select("title, description, brand, size, condition, color, material, price, reshopper, photos")
    .eq("id", id).single();
  if (error) return json({ error: error.message }, 500);

  // Allerede oversat: udlever den. Oversaettelsen aendrer sig ikke af sig selv.
  if (d.reshopper) return json(d.reshopper);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 900,
      system:
        "Du er en meget erfaren sælger på det danske genbrugsmarked og lægger nu en færdig annonce " +
        "over i Reshoppers felter.\n" +
        "Reshopper er børn, mor og bolig — ikke voksenmode. Er varen til et barn, er segment \"kids\".\n" +
        "Døm varens stand ud fra billedet, ikke ud fra den eksisterende tekst, som kan være skrevet " +
        "for en anden platform.\n" +
        "Skriv dansk, ligefremt og uden udråbstegn. Reshopper er forældre der handler med forældre.",
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{
        role: "user",
        content: [
          ...((Array.isArray(d.photos) ? d.photos : []).slice(0, 1)
            .filter((p: { url?: string }) => p?.url)
            .map((p: { url: string }) => ({ type: "image", source: { type: "url", url: p.url } }))),
          { type: "text", text:
            `Titel: ${d.title}\nBeskrivelse: ${d.description}\nMærke: ${d.brand ?? ""}\n` +
            `Størrelse: ${d.size ?? ""}\nStand: ${d.condition ?? ""}\nFarve: ${d.color ?? ""}\n` +
            `Materiale: ${d.material ?? ""}\nPris: ${d.price ?? ""}` },
        ],
      }],
    }),
  });
  if (!res.ok) return json({ error: `anthropic_${res.status}` }, 500);
  const block = (await res.json()).content?.find((b: { type?: string }) => b.type === "tool_use");
  if (!block?.input) return json({ error: "no_tool_use" }, 500);

  const o = block.input as Record<string, unknown>;
  // Prisen regnes her. Reshopper regner i oere, og en model regner upaalideligt.
  const kr = Math.round(Number(String(d.price ?? "").replace(/[^\d]/g, "")) || 0);
  const out = {
    segment: clean(o.segment), category: clean(o.category), conditionType: clean(o.conditionType),
    brandOrTitle: clean(o.brandOrTitle), age: clean(o.age), size: clean(o.size), gender: clean(o.gender),
    description: clean(o.description), extendedDescription: clean(o.extendedDescription),
    priceInKroner: kr, priceInHundreds: kr * 100,
  };
  await supabase.from("drafts").update({ reshopper: out }).eq("id", id);
  return json(out);
});
