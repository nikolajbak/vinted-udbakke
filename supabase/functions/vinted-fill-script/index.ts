// Serves the newest ready draft as JSON to the iOS Shortcut's fill script,
// which runs on Vinted's "Sælg en artikel" page and fills title/description/
// price. Deliberately does NOT touch the photo picker, the category picker,
// or the Upload/publish button: photo attachment can't be scripted by any web
// page for security reasons, the category picker is too fragile to script
// reliably, and publishing is always the seller's own decision.
//
// CORS is open because the fetch runs from vinted.dk's origin inside the
// Shortcut's injected script. The endpoint is read-only and gated by
// SHORTCUT_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  // The app stamps selected_at when you tap "Udfyld i Vinted" on a specific
  // card, so two people sharing the queue never pull each other's draft.
  // Falls back to the newest draft when nothing has been selected yet.
  const { data, error } = await supabase
    .from("drafts")
    .select("id, title, description, price")
    .eq("status", "ny")
    .order("selected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ empty: true });

  return json({
    id: data.id,
    title: data.title || "",
    description: data.description || "",
    // Vinted's price field wants a plain number.
    price: (data.price || "").replace(/[^\d.,]/g, "").replace(",", "."),
  });
});
