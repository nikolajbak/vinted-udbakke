// Two phases, both called from the iOS Shortcut while it sits on
// vinted.dk's "Sælg en artikel" page.
//
//   GET  -> the newest ready draft + the search query to price it against
//   POST -> comparables the PHONE fetched from Vinted, in exchange for the
//           final market-grounded price
//
// The phone does the Vinted lookup because Vinted blocks datacenter IPs but
// never blocks a same-origin request from a real logged-in session. That
// makes pricing reliable in a way no server-side scrape was.
//
// Never touches the photo picker, the category picker, or the Upload button:
// photo attachment can't be scripted by any web page, the category picker is
// too fragile to script, and publishing stays the seller's own decision.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function cleanText(value: unknown): string {
  let t = String(value ?? "");
  const cut = t.search(/<\/?\s*(description|parameter|title|price|invoke|function|antml)\b/i);
  if (cut > -1) t = t.slice(0, cut);
  return t.replace(/<[^>]*>/g, "").trim();
}

function plainPrice(price: string): string {
  return (price || "").replace(/[^\d.,]/g, "").replace(",", ".");
}

const PRICE_TOOL = {
  name: "saet_pris",
  description: "Sæt den endelige pris ud fra sammenlignelige annoncer.",
  input_schema: {
    type: "object",
    properties: {
      price: { type: "string", description: 'Konkret beløb, fx "89 kr"' },
      priceNote: { type: "string", description: "Kort strategi-begrundelse, 1-2 sætninger" },
    },
    required: ["price", "priceNote"],
  },
};

async function priceFromComparables(
  draft: Record<string, unknown>,
  comparables: Array<{ title?: string; price?: string; currency?: string }>,
): Promise<{ price: string; priceNote: string }> {
  const lines = comparables
    .slice(0, 12)
    .map((c) => `${c.title || "(uden titel)"} — ${c.price} ${c.currency || "DKK"}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 600,
      system:
        "Du er en meget erfaren sælger på Vinted med speciale i det danske marked. " +
        "Du sætter prisen på en vare ud fra aktuelle, sammenlignelige annoncer. " +
        "Læg en reel strategi: lidt under median giver hurtigt salg, toppen kan bæres hvis stand og mærke berettiger det. " +
        "Begrund kort og konkret i priceNote, med henvisning til hvad feltet ligger på.",
      tools: [PRICE_TOOL],
      tool_choice: { type: "tool", name: PRICE_TOOL.name },
      messages: [{
        role: "user",
        content: `Vare: ${draft.title}\nStand: ${draft.condition}\nBeskrivelse: ${draft.description}\n\n` +
          `${comparables.length} aktive, sammenlignelige annoncer på Vinted DK:\n${lines}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data?.content || []).find((b: { type?: string }) => b?.type === "tool_use");
  if (!block?.input) throw new Error("no_tool_use_in_response");
  return block.input as { price: string; priceNote: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  if (req.method === "GET") {
    // The app stamps selected_at when you tap "Udfyld i Vinted" on a specific
    // card, so two people sharing the queue never pull each other's draft.
    const { data, error } = await supabase
      .from("drafts")
      .select("id, title, description, price, search_query, price_grounded, condition")
      .eq("status", "ny")
      .order("selected_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ empty: true });

    return json({
      id: data.id,
      title: cleanText(data.title),
      description: cleanText(data.description),
      price: plainPrice(data.price || ""),
      searchQuery: data.search_query || data.title || "",
      needsPricing: !data.price_grounded,
    });
  }

  if (req.method === "POST") {
    let body: { id?: string; comparables?: Array<Record<string, string>> };
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    if (!body.id) return json({ error: "missing_id" }, 400);

    const { data: draft, error: draftErr } = await supabase
      .from("drafts")
      .select("id, title, description, condition, price")
      .eq("id", body.id)
      .single();
    if (draftErr) return json({ error: draftErr.message }, 500);

    const comparables = body.comparables || [];
    if (!comparables.length) {
      // Nothing to price against — keep the provisional price rather than
      // pretending it was market-checked.
      return json({ price: plainPrice(draft.price || ""), grounded: false });
    }

    try {
      const result = await priceFromComparables(draft, comparables);
      await supabase
        .from("drafts")
        .update({
          price: cleanText(result.price),
          price_note: cleanText(result.priceNote),
          price_grounded: true,
        })
        .eq("id", body.id);
      return json({ price: plainPrice(result.price), priceNote: result.priceNote, grounded: true });
    } catch (err) {
      return json({
        price: plainPrice(draft.price || ""),
        grounded: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({ error: "method_not_allowed" }, 405);
});
