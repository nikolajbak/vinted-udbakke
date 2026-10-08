// Vinteds egne mails som push: salg, bud og beskeder, uden at telefonen skal
// have noget aabent og uden et ur, der spoerger.
//
// Serveren kan ikke se Vinted — datacenter-IP'er er blokeret, og Vinted har
// ingen webhooks. Men Vinted sender selv en mail, naar en vare er solgt, og
// naar en koeber skriver eller byder. En mailregel sender de mails videre til
// en modtagertjeneste, som POSTer dem hertil.
//
// Tre formater forstaas, saa tjenesten kan skiftes uden at roere koden:
//   - CloudMailin, "JSON (Normalized)": headers.subject, plain, html
//   - Postmark inbound: Subject, TextBody, HtmlBody, MessageID
//   - den raa mail (message/rfc822 eller text/plain), fx fra en Cloudflare
//     Email Worker
//
// Vinteds mailformat er IKKE maalt. Reglerne nedenfor er gaettet, og derfor
// gemmes hver eneste mail i `vinted_mails` — ogsaa dem, der ikke blev
// forstaaet. Det er dem, reglerne skal rettes paa.

import { createClient } from "npm:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAIL_KEY = Deno.env.get("MAIL_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

type Mail = { fra: string; emne: string; tekst: string; html: string; messageId: string | null };

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return str(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o.address ?? o.Email ?? o.value ?? o.Value ?? "");
  }
  return String(v);
}

function felt(h: unknown, ...navne: string[]): string {
  if (!h) return "";
  // Postmark: [{Name, Value}]. CloudMailin: {subject: "..."}.
  if (Array.isArray(h)) {
    for (const n of navne) {
      const x = h.find((e) => String(e?.Name ?? e?.name ?? "").toLowerCase() === n.toLowerCase());
      if (x) return str(x.Value ?? x.value);
    }
    return "";
  }
  const o = h as Record<string, unknown>;
  for (const n of navne) {
    for (const k of Object.keys(o)) if (k.toLowerCase() === n.toLowerCase()) return str(o[k]);
  }
  return "";
}

async function laesMail(req: Request): Promise<Mail> {
  const type = req.headers.get("content-type") || "";
  if (type.includes("json")) {
    const o = await req.json() as Record<string, unknown>;
    const h = o.headers ?? o.Headers;
    return {
      fra: felt(h, "from") || str(o.From ?? o.from ?? o.FromFull ?? (o.envelope as Record<string, unknown>)?.from),
      emne: felt(h, "subject") || str(o.Subject ?? o.subject),
      tekst: str(o.plain ?? o.TextBody ?? o.text),
      html: str(o.html ?? o.HtmlBody),
      messageId: felt(h, "message_id", "message-id") || str(o.MessageID ?? o.messageId) || null,
    };
  }
  if (type.includes("multipart/form-data")) {
    const f = await req.formData();
    const g = (k: string) => String(f.get(k) ?? "");
    return {
      fra: g("headers[from]") || g("envelope[from]"),
      emne: g("headers[subject]"),
      tekst: g("plain"),
      html: g("html"),
      messageId: g("headers[message_id]") || null,
    };
  }
  const p = await PostalMime.parse(await req.text());
  return {
    fra: p.from?.address || "",
    emne: p.subject || "",
    tekst: p.text || "",
    html: p.html || "",
    messageId: p.messageId || null,
  };
}

function udenTags(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// Hvad handler mailen om? Emnet foerst: en besked om en solgt vare naevner
// "solgt" i teksten, men emnet siger, at det er en besked.
function slags(emne: string, tekst: string): string {
  const s = norm(emne) || norm(tekst).slice(0, 300);
  // Dit eget koeb er ikke et salg.
  if (/du har købt|dit køb|your purchase|you bought/.test(s)) return "andet";
  if (/solgt|har købt|købte|sold|purchased|bought/.test(s)) return "solgt";
  if (/\bbud\b|tilbud|\boffer|byder/.test(s)) return "bud";
  if (/besked|message|skrev|skrevet/.test(s)) return "besked";
  return "andet";
}

function beloeb(tekst: string): number | null {
  const m = tekst.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:kr\.?|dkk)/i) ||
    tekst.match(/(?:kr\.?|dkk)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  const n = Math.round(Number(m[1].replace(",", ".")));
  return n > 0 ? n : null;
}

// Annoncenumre i mailen. Linkene kan vaere pakket ind i en sporingsadresse,
// saa der ledes ogsaa i den URL-kodede form.
function annonceNumre(...kilder: string[]): string[] {
  const ud = new Set<string>();
  for (const k of kilder) {
    for (const m of k.matchAll(/items(?:\/|%2F)(\d{6,})/gi)) ud.add(m[1]);
  }
  return [...ud];
}

type Raekke = {
  id: string; external_id: string; title: string | null; status: string;
  price: number; draft_id: string | null; published: Record<string, unknown> | null;
};

// Nummeret i et link foerst; ellers den laengste titel, der staar i mailen.
// En titel paa under seks tegn ("Jakke") er ikke nok til at pege paa en vare.
function findAnnonce(raekker: Raekke[], numre: string[], tekst: string): Raekke | null {
  const paaNr = raekker.find((r) => numre.includes(String(r.external_id)));
  if (paaNr) return paaNr;
  const t = norm(tekst);
  let bedst: Raekke | null = null, laengde = 0;
  for (const r of raekker) {
    for (const titel of [r.published?.title, r.title]) {
      const n = norm(titel);
      if (n.length >= 6 && n.length > laengde && t.includes(n)) { bedst = r; laengde = n.length; }
    }
  }
  return bedst;
}

async function puf(title: string, body: string, url: string) {
  if (!WEBHOOK_SECRET) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
      body: JSON.stringify({ title, body, url }),
    });
  } catch { /* en manglende notifikation maa ikke vaelte resten */ }
}

// Gennemgangen af salgene koerer efter hvert salg. Den bor i
// vinted-fill-script, saa den kaldes dér i stedet for at blive bagt ind to
// steder.
function laerIBaggrunden() {
  const p = fetch(`${SUPABASE_URL}/functions/v1/vinted-fill-script?key=${SHORTCUT_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "laer" }),
  }).catch((err) => console.error("laer", err));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (!MAIL_KEY || url.searchParams.get("key") !== MAIL_KEY) return json({ error: "unauthorized" }, 401);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let m: Mail;
  try { m = await laesMail(req); } catch (err) {
    console.error("mail kunne ikke laeses", err);
    return json({ error: "ulaeselig" }, 400);
  }

  const tekst = (m.tekst || udenTags(m.html)).slice(0, 20000);
  // En videresendt mail kan have dit eget navn som afsender og Vinted inde i
  // teksten. Derfor tjekkes begge.
  const fraVinted = /vinted/i.test(m.fra) || /vinted/i.test(m.html) || /vinted/i.test(tekst);
  const kind = fraVinted ? slags(m.emne, tekst) : "andet";
  const numre = annonceNumre(m.html, m.tekst);
  const bud = kind === "bud" ? beloeb(m.emne + " " + tekst) : null;

  const { data: raekker } = await supabase.from("listings")
    .select("id, external_id, title, status, price, draft_id, published")
    .eq("platform", "vinted").not("external_id", "is", null);
  const l = fraVinted ? findAnnonce((raekker ?? []) as Raekke[], numre, m.emne + "\n" + tekst) : null;

  const { data: gemt, error } = await supabase.from("vinted_mails").insert({
    message_id: m.messageId, fra: m.fra.slice(0, 300), emne: m.emne.slice(0, 500), tekst,
    kind, item_id: l?.external_id ?? numre[0] ?? null, listing_id: l?.id ?? null, beloeb: bud,
  }).select("id").single();
  if (error) {
    // Tjenesten sender den samme mail igen, hvis den ikke fik et svar i tide.
    if (error.code === "23505") return json({ ok: true, dublet: true });
    console.error("vinted_mails", error);
    return json({ error: error.message }, 500);
  }

  const titel = String(l?.published?.title || l?.title || "").trim();
  let nr: number | null = null;
  if (l?.draft_id) {
    const { data: d } = await supabase.from("drafts").select("nr").eq("id", l.draft_id).maybeSingle();
    nr = d?.nr ?? null;
  }
  const appUrl = "/vinted-udbakke/" + (nr ? "#v" + nr : "");

  let handling = "gemt";
  if (!fraVinted) {
    handling = "ikke fra Vinted — intet gjort";
  } else if (kind === "solgt") {
    if (l && l.status === "aktiv") {
      await supabase.from("listings").update({
        status: "solgt", sold_at: new Date().toISOString(),
        pending: null, pending_note: null, pending_since: null,
      }).eq("id", l.id);
      await supabase.from("price_events").insert({
        listing_id: l.id, kind: "solgt", price: Number(l.price),
        note: "mail fra Vinted: " + m.emne.slice(0, 120),
      });
      laerIBaggrunden();
      // Ligger varen ogsaa paa DBA eller Reshopper, skal den ned dér - ellers
      // kan den saelges to gange. Det kan appen ikke selv, saa beskeden siger det.
      let ogsaa = "";
      if (l.draft_id) {
        const { data: d } = await supabase.from("drafts").select("posted_to, taget_ned")
          .eq("id", l.draft_id).maybeSingle();
        const sendt = (d?.posted_to ?? {}) as Record<string, string>;
        const ned = (d?.taget_ned ?? {}) as Record<string, string>;
        const navne = [sendt.dba && !ned.dba ? "DBA" : "", sendt.reshopper && !ned.reshopper ? "Reshopper" : ""]
          .filter(Boolean);
        if (navne.length) ogsaa = " Slet den også på " + navne.join(" og ") + ".";
      }
      await puf("Solgt!", (titel || "En vare") + " er solgt på Vinted." + ogsaa +
        " Tast salgsprisen i appen.", appUrl);
      handling = "annoncen meldt solgt";
    } else if (l) {
      handling = "annoncen var allerede " + l.status;
    } else {
      await puf("Solgt på Vinted", m.emne || "En vare er solgt", appUrl);
      handling = "solgt, men ingen annonce i appen passede";
    }
  } else if (kind === "bud") {
    await puf(titel ? "Bud på " + titel : "Nyt bud på Vinted",
      bud ? Math.round(Number(bud)) + ",00 kr" + (l ? " — du har sat den til " + Math.round(Number(l.price)) + ",00 kr" : "") : (m.emne || "Se buddet på Vinted"),
      appUrl);
    handling = "bud meldt";
  } else if (kind === "besked") {
    await puf("Ny besked på Vinted", titel ? "Om " + titel : (m.emne || ""), appUrl);
    handling = "besked meldt";
  }

  await supabase.from("vinted_mails").update({ handling }).eq("id", gemt.id);
  return json({ ok: true, kind, listing: l?.id ?? null, handling });
});
