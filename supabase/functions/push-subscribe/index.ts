// Klienten sender sit push-abonnement hertil, naar brugeren slaar
// notifikationer til. Én pr. enhed; endpoint er noeglen, saa samme telefon
// ikke faar to. Beskyttet med SHORTCUT_KEY som resten af klientens kald.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) return json({ error: "unauthorized" }, 401);

  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return json({ error: "missing_subscription" }, 400);
  }

  // Afmelding: klienten sletter sit eget abonnement.
  if (req.method === "DELETE") {
    await supabase.from("push_subs").delete().eq("endpoint", sub.endpoint);
    return json({ ok: true });
  }

  const { error } = await supabase.from("push_subs").upsert({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    last_ok_at: null,
  }, { onConflict: "endpoint" });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
