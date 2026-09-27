// Sender en push til alle gemte enheder. Kaldes server-til-server (fx af
// analyze-draft, naar et udkast bliver 'ny'), beskyttet med WEBHOOK_SECRET.
//
// Web Push kraever VAPID-signering (JWT/ES256) og payload-kryptering
// (aes128gcm). Det goer npm:web-push for os - at bygge det i haanden ville
// vaere en fejlkilde uden gevinst.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);

  let body: { title?: string; body?: string; url?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const payload = JSON.stringify({
    title: (body.title || "VintedAuto").slice(0, 80),
    body: (body.body || "").slice(0, 160),
    url: body.url || "/vinted-udbakke/",
  });

  const { data: subs, error } = await supabase
    .from("push_subs")
    .select("endpoint, p256dh, auth");
  if (error) return json({ error: error.message }, 500);
  if (!subs?.length) return json({ sent: 0, pruned: 0, note: "ingen abonnenter" });

  let sent = 0, pruned = 0;
  const doede: string[] = [];
  await Promise.all(subs.map(async (s) => {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      // 404/410 = abonnementet er dodt (afinstalleret, notifikationer slaaet
      // fra). Ryd det, saa listen ikke groer med spoegelser.
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { doede.push(s.endpoint); pruned++; }
    }
  }));
  if (doede.length) await supabase.from("push_subs").delete().in("endpoint", doede);

  return json({ sent, pruned });
});
