// Vinteds egne mails: salg, bud, beskeder og favoritter, uden at telefonen skal
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
// Hver mail gemmes i `vinted_mails` og laeses af en model (bestemt af dig
// 9. oktober: analysér alle indgaaende mails, brug dem til det, de kan, og
// laer af alle haendelser). Moenstrene for solgt, bud og favorit er maalt paa
// rigtige mails og vinder over modellen; en slags, ingen har set foer, meldes
// med en push foerste gang.

import { createClient } from "npm:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.3";
import { helKroner, kr } from "../_shared/pris.ts";
import { modelKald } from "../_shared/model.ts";
import { noterForbrug } from "../_shared/forbrug.ts";
import { laesFaktura } from "../_shared/annoncering.ts";
import { erForsendelse, fletForsendelse, laesForsendelse, vaelgMaerkat, type Fil, type Forsendelse } from "../_shared/forsendelse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAIL_KEY = Deno.env.get("MAIL_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

type Mail = { fra: string; emne: string; tekst: string; html: string; messageId: string | null; filer: Fil[] };

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

// Vedhaeftningerne (fragtmaerkatet). CloudMailin: attachments [{file_name,
// content_type, content (base64) | url}]; Postmark: Attachments [{Name,
// ContentType, Content}]. Ikke maalt: om CloudMailin sender dem med paa
// vores plan - handling siger »ingen fil vedhæftet«, hvis ikke.
function fraBase64(b: string): Uint8Array {
  const bin = atob(b.replace(/\s+/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
async function jsonFiler(liste: unknown): Promise<Fil[]> {
  const ud: Fil[] = [];
  if (!Array.isArray(liste)) return ud;
  for (const a of liste.slice(0, 10) as Record<string, unknown>[]) {
    const navn = str(a.file_name ?? a.Name ?? a.filename ?? "");
    const type = str(a.content_type ?? a.ContentType ?? a.mimeType ?? "");
    try {
      if (a.content || a.Content) ud.push({ navn, type, data: fraBase64(str(a.content ?? a.Content)) });
      else if (typeof a.url === "string") {
        const r = await fetch(a.url);
        if (r.ok) ud.push({ navn, type, data: new Uint8Array(await r.arrayBuffer()) });
      }
    } catch (err) { console.error("vedhaeftning", navn, err); }
  }
  return ud;
}

async function laesIndgaaende(req: Request): Promise<Mail> {
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
      filer: await jsonFiler(o.attachments ?? o.Attachments),
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
      filer: await Promise.all([...f.entries()].filter(([k, v]) => /^attachments/.test(k) && v instanceof File)
        .slice(0, 10).map(async ([, v]) => {
          const fil = v as File;
          return { navn: fil.name, type: fil.type, data: new Uint8Array(await fil.arrayBuffer()) };
        })),
    };
  }
  const p = await PostalMime.parse(await req.text());
  return {
    fra: p.from?.address || "",
    emne: p.subject || "",
    tekst: p.text || "",
    html: p.html || "",
    messageId: p.messageId || null,
    filer: (p.attachments ?? []).slice(0, 10).map((a) => ({
      navn: a.filename || "", type: a.mimeType || "",
      data: typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content),
    })),
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
// "solgt" i teksten, men emnet siger, at det er en besked. Moenstrene her er
// MAALT paa rigtige mails (9. oktober) og vinder over modellen; alt andet
// afgoer modellens laesning (laesMail).
function slags(emne: string, tekst: string): string {
  const s = norm(emne) || norm(tekst).slice(0, 300);
  // Fakturaen for et boost (maalt paa mail 44, 19. oktober). Foerst: den er
  // dit eget koeb, og teksten naevner hverken salg eller bud.
  if (/boost af din artikel/.test(s)) return "boost";
  // Forsendelsen (maalt 9.-19. oktober, _shared/forsendelse.ts): kun paa
  // emnet - salgsmailen naevner ogsaa fragtmaerkatet.
  if (erForsendelse(emne)) return "forsendelse";
  // Dit eget koeb er ikke et salg.
  if (/du har købt|dit køb|your purchase|you bought/.test(s)) return "andet";
  // "Din <titel> er lige blevet markeret som favorit"
  if (/markeret som favorit|som favorit/.test(s)) return "favorit";
  if (/solgt|har købt|købte|sold|purchased|bought/.test(s)) return "solgt";
  // Vinteds bud-mail har tysk emne ("Neues Angebot für …") og dansk tekst
  // ("… vil gerne købe … til en lavere pris"). Målt på den første, 9. oktober.
  if (/\bbud\b|tilbud|\boffer|byder|angebot|lavere pris/.test(s)) return "bud";
  if (/besked|message|skrev|skrevet/.test(s)) return "besked";
  return "andet";
}

// Links og videresendelsens ">" tages ud foerst: sporingsadresserne er lange
// base64-strenge, hvor et tal ved "kr" kan optraede tilfaeldigt.
function renTekst(tekst: string): string {
  return tekst.replace(/<?https?:\/\/\S+>?/g, " ").replace(/^[ \t]*>[ \t]?/gm, "");
}

// Beloebet i mailen (maalt 9. oktober):
//   bud:     "Ny pris:\nkr.80.00 i stedet for kr.100.00"
//   salg:    "<titel>\n80.00 kr."
//   favorit: "150.00 kr." (varens pris nu)
// "tal kr" proeves foer "kr tal": efter "80.00 kr." kan der staa et
// brugernavn, der begynder med cifre.
function beloeb(tekst: string): number | null {
  const t = renTekst(tekst);
  const tal = "(\\d[\\d.,]*)";
  const m = t.match(new RegExp("ny pris:?\\s*(?:kr\\.?|dkk)\\s*" + tal, "i")) ||
    t.match(new RegExp(tal + "\\s*(?:kr\\b|dkk)", "i")) ||
    t.match(new RegExp("\\b(?:kr\\.?|dkk)\\s*" + tal, "i"));
  const n = m ? helKroner(m[1]) : 0;
  return n > 0 ? n : null;
}

// Annoncens pris NU, som buddet naevner den: "i stedet for kr.100.00".
function prisFoerBud(tekst: string): number | null {
  const m = renTekst(tekst).match(/i stedet for\s*(?:kr\.?|dkk)?\s*(\d[\d.,]*)/i);
  const n = m ? helKroner(m[1]) : 0;
  return n > 0 ? n : null;
}

// Vinteds links er pakket ind: links.vinted.com/t/<base64 af
// "https://www.vinted.dk/e/item?id=123|…"> (maalt 9. oktober). Kommer mailen
// direkte (ikke videresendt), har den kun HTML, og saa staar linkene kun dér.
function vintedLinks(...kilder: string[]): string[] {
  const ud = new Set<string>();
  for (const k of kilder) {
    for (const m of k.matchAll(/https?:\/\/(?:www\.)?vinted\.dk\/[^\s"'<>|]+/g)) ud.add(m[0]);
    for (const m of k.matchAll(/links\.vinted\.com\/(?:e\/)?t\/([A-Za-z0-9_\-+\/=]+)/g)) {
      try {
        const u = atob(m[1].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "")).split("|")[0];
        if (/^https?:\/\/(?:www\.)?vinted\.dk\//.test(u)) ud.add(u);
      } catch { /* ikke base64 */ }
    }
  }
  return [...ud].slice(0, 30);
}

// Annoncenumre i mailen - ogsaa i den URL-kodede form.
function annonceNumre(links: string[], ...kilder: string[]): string[] {
  const ud = new Set<string>();
  for (const k of [...links, ...kilder]) {
    for (const m of k.matchAll(/items(?:\/|%2F)(\d{6,})|item\?id=(\d{6,})/gi)) ud.add(m[1] ?? m[2]);
  }
  return [...ud];
}

// Samtalen med koeberen: https://www.vinted.dk/inbox/<id> (uden sporingen).
function samtaleUrl(links: string[]): string | null {
  for (const u of links) {
    const m = u.match(/^https:\/\/www\.vinted\.dk\/inbox\/[0-9a-f-]{8,}/i);
    if (m) return m[0];
  }
  return null;
}

// Modellens laesning af mailen. Hver mail fra Vinted laeses - ogsaa de
// slags, ingen har set endnu - saa den kan bruges til det, den kan, og saa
// en ny slags kan ses og besluttes. Fejler kaldet, gaar mailen videre paa de
// maalte moenstre alene.
const SLAGS = ["solgt", "bud", "besked", "favorit", "forsendelse", "udbetaling", "bedoemmelse",
  "eget_koeb", "konto", "reklame", "andet"];
const LAES_TOOL = {
  name: "laes_mail",
  description: "Det, mailen fra Vinted siger.",
  input_schema: {
    type: "object",
    properties: {
      slags: { type: "string", enum: SLAGS, description:
        "solgt = en af saelgerens varer er solgt. bud = en koeber byder. besked = en koeber har skrevet. " +
        "favorit = en vare er markeret som favorit. forsendelse = fragtlabel, afsendt, leveret, afhentet. " +
        "udbetaling = penge til saldo/bank. bedoemmelse = en anmeldelse/vurdering. eget_koeb = saelgeren " +
        "har selv koebt noget. konto = login, sikkerhed, vilkaar. reklame = nyhedsbrev, kampagne. " +
        "andet = intet af det." },
      titel: { type: "string", description: "Varens titel, som den staar i mailen. Tom, hvis ingen." },
      pris: { type: "number", description: "Varens AKTUELLE udbudspris i kr, hvis mailen naevner den. 0 ellers." },
      beloeb: { type: "number", description: "Buddet eller salgsprisen i kr. 0 ellers." },
      besked: { type: "string", description:
        "Koeberens egne ord, ORDRET, hvis de staar i mailen. Tom, hvis mailen kun siger, at der er en besked." },
      resume: { type: "string", description: "Hvad mailen siger, i én kort dansk saetning." },
      kan_bruges: { type: "string", description:
        "Kun for en slags, en saelger-app ikke kender: hvad appen konkret kunne bruge mailen til. Tom ellers." },
    },
    required: ["slags", "titel", "pris", "beloeb", "besked", "resume", "kan_bruges"],
  },
};

type Laesning = {
  slags: string; titel: string; pris: number; beloeb: number; besked: string;
  resume: string; kan_bruges: string; links?: string[];
};

async function laesMail(emne: string, tekst: string): Promise<Laesning | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await modelKald({
        model: "claude-haiku-5-5",
        max_tokens: 800,
        system: "Du laeser mails fra Vinted til en dansk saelger og siger praecist, hvad de handler om. " +
          "Find aldrig paa noget, der ikke staar i mailen. Emnet kan vaere paa et andet sprog end teksten.",
        tools: [LAES_TOOL],
        tool_choice: { type: "tool", name: LAES_TOOL.name },
        messages: [{ role: "user", content: "Emne: " + emne + "\n\n" + renTekst(tekst).slice(0, 6000) }],
      }, { trin: "mail:laes" });
    if (!res.ok) { console.error("laes_mail", res.status, await res.text()); return null; }
    const data = await res.json();
    await noterForbrug(data, "mail:laes");
    const blok = (data?.content || []).find((b: { type?: string }) => b?.type === "tool_use");
    const i = blok?.input as Record<string, unknown> | undefined;
    if (!i) return null;
    const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
    return {
      slags: SLAGS.includes(String(i.slags)) ? String(i.slags) : "andet",
      titel: t(i.titel, 200), pris: helKroner(i.pris), beloeb: helKroner(i.beloeb),
      besked: t(i.besked, 1500), resume: t(i.resume, 300), kan_bruges: t(i.kan_bruges, 300),
    };
  } catch (err) {
    console.error("laes_mail", err);
    return null;
  }
}

type Raekke = {
  id: string; external_id: string; title: string | null; status: string;
  price: number; draft_id: string | null; published: Record<string, unknown> | null;
  pending: Record<string, unknown> | null; favourites: number | null;
  forsendelse: Forsendelse | null;
};

// Slags, der kun gaelder en annonce, vi selv har til salg.
const KOEBERS = new Set(["besked", "bud"]);

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

// Arbejde efter svaret: tjenesten venter paa et svar, og koeber-assistenten
// og gennemgangen tager hver et modelkald.
function baggrund(p: Promise<unknown>) {
  const q = p.catch((err) => console.error("baggrund", err));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(q);
}

// Gennemgangen af salgene koerer efter hvert salg. Den bor i
// vinted-fill-script, saa den kaldes dér i stedet for at blive bagt ind to
// steder.
function laerIBaggrunden() {
  baggrund(fetch(`${SUPABASE_URL}/functions/v1/vinted-fill-script?key=${SHORTCUT_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "laer" }),
  }));
}

// Prisen, mailen siger annoncen staar til NU. Rettes prisen i Vinteds egen
// app, sender Vinted ingen mail om det - men bud- og favorit-mailen naevner
// prisen. Samme notering som en pris laest af annoncen (`mode:'synk'`):
// `aendret` med "rettet på Vinted", last_change_at, og et ventende felt, der
// allerede staar i annoncen, ryddes.
async function synkPris(l: Raekke, nu: number, kilde: string): Promise<string> {
  const foer = Number(l.price);
  if (!(nu > 0) || nu === foer) return "";
  const pub = { ...(l.published ?? {}), price: nu };
  const opd: Record<string, unknown> = {
    price: nu, published: pub, last_change_at: new Date().toISOString(), synced_at: new Date().toISOString(),
  };
  const p = l.pending as Record<string, unknown> | null;
  if (p && "price" in p && helKroner(p.price) === nu) {
    const rest = { ...p };
    delete rest.price;
    opd.pending = Object.keys(rest).length ? rest : null;
    if (!opd.pending) { opd.pending_note = null; opd.pending_since = null; }
  }
  await supabase.from("listings").update(opd).eq("id", l.id);
  await supabase.from("price_events").insert({
    listing_id: l.id, kind: "aendret", price: nu, from_price: foer,
    note: "rettet på Vinted (set i " + kilde + ")",
  });
  return `pris ${foer} → ${nu}`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (!MAIL_KEY || url.searchParams.get("key") !== MAIL_KEY) return json({ error: "unauthorized" }, 401);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // `?genlaes=<id>`: en gemt mail laeses og bruges igen, uden push. Til naar
  // reglerne er rettet, og de mails, der kom foer, skal have gavn af det.
  const genlaes = Number(url.searchParams.get("genlaes")) || 0;
  let m: Mail;
  let gemtId = 0;
  let mailTid = new Date().toISOString();
  let gemteLinks: string[] = [];
  if (genlaes) {
    const { data: r } = await supabase.from("vinted_mails").select("id, at, fra, emne, tekst, laesning")
      .eq("id", genlaes).maybeSingle();
    if (!r) return json({ error: "ukendt" }, 404);
    m = { fra: r.fra ?? "", emne: r.emne ?? "", tekst: r.tekst ?? "", html: "", messageId: null, filer: [] };
    gemtId = r.id;
    mailTid = r.at;
    gemteLinks = ((r.laesning as Laesning | null)?.links ?? []) as string[];
  } else {
    try { m = await laesIndgaaende(req); } catch (err) {
      console.error("mail kunne ikke laeses", err);
      return json({ error: "ulaeselig" }, 400);
    }
  }
  const stille = genlaes > 0;
  const push = (t: string, b: string, u: string) => stille ? Promise.resolve() : puf(t, b, u);

  const tekst = (m.tekst || udenTags(m.html)).slice(0, 20000);
  // En videresendt mail kan have dit eget navn som afsender og Vinted inde i
  // teksten. Derfor tjekkes begge.
  const fraVinted = /vinted/i.test(m.fra) || /vinted/i.test(m.html) || /vinted/i.test(tekst);
  const links = [...new Set([...gemteLinks, ...vintedLinks(m.html, m.tekst)])];
  const maalt = fraVinted ? slags(m.emne, tekst) : "andet";
  const numre = annonceNumre(links, m.html, m.tekst);
  const { data: raekker } = await supabase.from("listings")
    .select("id, external_id, title, status, price, draft_id, published, pending, favourites, forsendelse")
    .eq("platform", "vinted").not("external_id", "is", null);
  const find = (titel?: string) => fraVinted
    ? findAnnonce((raekker ?? []) as Raekke[], numre, m.emne + "\n" + tekst + (titel ? "\n" + titel : ""))
    : null;

  // Kun beskeder og bud paa VORES annoncer (bestemt af dig 16. oktober). En
  // besked eller et tilbud om en vare, vi selv har spurgt til, ser ud som en
  // koebers (nr. 30-31: parykker) og maa hverken laeses af modellen, gemmes,
  // pushes eller taelle med i gennemgangen. Den maalte slags afgoer det foer
  // modelkaldet; modellens slags efter.
  const ikkeVores = async () => {
    if (genlaes) {
      await supabase.from("koeber_beskeder").delete().eq("vinted_mail_id", gemtId);
      await supabase.from("vinted_mails").delete().eq("id", gemtId);
    }
    console.log("ikke vores annonce, ignoreret:", m.emne.slice(0, 120));
    return json({ ok: true, ignoreret: "ikke vores annonce" });
  };
  let l = find();
  if (!l && KOEBERS.has(maalt)) return await ikkeVores();
  const laest = fraVinted ? await laesMail(m.emne, tekst) : null;
  const kind = !fraVinted ? "andet" : maalt !== "andet" ? maalt : (laest?.slags ?? "andet");
  l = l ?? find(laest?.titel);
  if (!l && KOEBERS.has(kind)) return await ikkeVores();
  const bud = kind === "bud" || kind === "solgt" || kind === "favorit"
    ? (beloeb(m.emne + " " + tekst) ?? (laest?.beloeb || laest?.pris || null)) : null;
  const laesning = laest ? { ...laest, links } : (links.length ? { links } : null);

  const raekke = {
    kind, item_id: l?.external_id ?? numre[0] ?? null, listing_id: l?.id ?? null, beloeb: bud, laesning,
  };
  if (genlaes) {
    await supabase.from("vinted_mails").update(raekke).eq("id", gemtId);
  } else {
    const { data: gemt, error } = await supabase.from("vinted_mails").insert({
      message_id: m.messageId, fra: m.fra.slice(0, 300), emne: m.emne.slice(0, 500), tekst, ...raekke,
    }).select("id").single();
    if (error) {
      // Tjenesten sender den samme mail igen, hvis den ikke fik et svar i tide.
      if (error.code === "23505") return json({ ok: true, dublet: true });
      console.error("vinted_mails", error);
      return json({ error: error.message }, 500);
    }
    gemtId = gemt.id;
  }

  const titel = String(l?.published?.title || l?.title || laest?.titel || "").trim();
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
    // Forsendelsen begynder: maerkatet laves i samtalen, og Vinted giver
    // 5 dage (»Send denne ordre inden for 5 dage«). Maerkat-mailens frist
    // gaar forud, ogsaa naar mailene genlaeses i en anden raekkefoelge.
    if (l) {
      const dage = Number(tekst.match(/inden for (\d+) dage/i)?.[1]) || 5;
      await supabase.from("listings").update({
        forsendelse: fletForsendelse(l.forsendelse, {
          status: "mangler", tekst: "Solgt — lav fragtmærkatet i samtalen",
          samtale: samtaleUrl(links) ?? undefined,
          frist: l.forsendelse?.frist ? undefined : new Date(new Date(mailTid).getTime() + dage * 86400000).toISOString(),
        }, mailTid, gemtId),
      }).eq("id", l.id);
    }
    if (l && l.status === "aktiv") {
      await supabase.from("listings").update({
        status: "solgt", sold_at: new Date().toISOString(),
        ...(bud ? { sold_price: bud } : {}),
        pending: null, pending_note: null, pending_since: null,
      }).eq("id", l.id);
      await supabase.from("price_events").insert({
        listing_id: l.id, kind: "solgt", price: bud ?? Number(l.price),
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
      await push("Solgt!", (titel || "En vare") + " er solgt på Vinted." + ogsaa +
        (bud ? " Solgt for " + kr(bud) + "." : " Tast salgsprisen i appen."), appUrl);
      handling = "annoncen meldt solgt";
    } else if (l) {
      handling = "annoncen var allerede " + l.status;
    } else {
      await push("Solgt på Vinted", m.emne || "En vare er solgt", appUrl);
      handling = "solgt, men ingen annonce i appen passede";
    }
  } else if (kind === "bud") {
    const nu = prisFoerBud(tekst) ?? (laest?.pris || 0);
    const synk = l && l.status === "aktiv" ? await synkPris(l, nu, "bud-mail") : "";
    await push(titel ? "Bud på " + titel : "Nyt bud på Vinted",
      bud ? kr(bud) + (nu || l ? " — den står til " + kr(nu || l!.price) : "") : (m.emne || "Se buddet på Vinted"),
      appUrl);
    // Buddet er en koebersamtale: gennemgangen af kommunikationen laerer af det.
    if (!stille || !(await harKoeberRaekke(gemtId))) {
      await supabase.from("koeber_beskeder").insert({
        listing_id: l?.id ?? null, platform: "vinted", item_title: titel.slice(0, 200) || null,
        offer: bud, intent: "bud", kilde: "mail", samtale: samtaleUrl(links),
        vinted_mail_id: gemtId, besvaret_at: new Date().toISOString(),
      });
    }
    handling = "bud meldt" + (synk ? "; " + synk : "");
  } else if (kind === "forsendelse") {
    // Fragtmaerkatet og forsendelsens gang paa varen (bestemt af dig
    // 19. oktober). Ingen push: Vinted har selv sendt mailen.
    const f = laesForsendelse(m.emne, tekst);
    if (!l) {
      handling = "forsendelse; ingen annonce i appen passede";
    } else if (!f) {
      handling = "forsendelse; mailen kunne ikke læses";
    } else {
      const ny = { ...f, samtale: samtaleUrl(links) ?? undefined };
      let filNote = "";
      if (f.status === "klar" && !genlaes) {
        const fil = vaelgMaerkat(m.filer);
        if (fil) {
          const ext = /pdf/i.test(fil.type) || /\.pdf$/i.test(fil.navn) ? "pdf"
            : (fil.type.split("/")[1] || "png").replace("jpeg", "jpg");
          const sti = l.id + "/" + gemtId + "." + ext;
          const { error } = await supabase.storage.from("maerkater").upload(sti, fil.data, {
            contentType: fil.type || (ext === "pdf" ? "application/pdf" : "image/" + ext), upsert: true,
          });
          if (error) filNote = "; mærkatet kunne ikke gemmes — " + error.message;
          else { ny.maerkat = sti; ny.maerkat_type = ext; filNote = "; mærkat gemt (" + ext + ")"; }
        } else {
          filNote = "; ingen fil vedhæftet (" + m.filer.length + " filer: " +
            m.filer.map((x) => x.type || x.navn).join(", ").slice(0, 120) + ")";
        }
      }
      await supabase.from("listings").update({ forsendelse: fletForsendelse(l.forsendelse, ny, mailTid, gemtId) })
        .eq("id", l.id);
      handling = "forsendelse: " + f.tekst + filNote;
    }
  } else if (kind === "boost") {
    // Betalt annoncering (bestemt af dig 19. oktober): fakturaen bliver en
    // ordre uden varer. Runneren finder dem i garderoben (promoted, mode
    // 'boost' i vinted-fill-script) og deler beloebet. Ingen push - det er
    // dit eget koeb. Samme mail to gange er én ordre (vinted_mail_id unik).
    const f = laesFaktura(m.emne, tekst);
    if (f) {
      const start = new Date(mailTid);
      const { error } = await supabase.from("annoncering_ordrer").upsert({
        at: start.toISOString(), plads: "vinted", slags: f.slags, kr_i_alt: f.kr, antal: f.antal,
        dage: f.dage, start: start.toISOString(),
        slut: new Date(start.getTime() + f.dage * 86400000).toISOString(),
        vinted_mail_id: gemtId, tekst: f.tekst,
      }, { onConflict: "vinted_mail_id", ignoreDuplicates: true });
      handling = error
        ? "boost: ordren kunne ikke gemmes — " + error.message
        : "boost: " + f.antal + (f.antal === 1 ? " vare, " : " varer, ") + f.kr.toFixed(2).replace(".", ",") + " kr — venter på garderoben";
    } else {
      await push("Ny slags mail fra Vinted", laest?.resume || m.emne || "Se mailen", "/vinted-udbakke/");
      handling = "boost: fakturaen kunne ikke læses — meldt";
    }
  } else if (kind === "favorit") {
    // Stille, bestemt af dig 9. oktober: prisen og hjerterne opdateres, ingen push.
    if (l && l.status === "aktiv") {
      const synk = await synkPris(l, bud ?? 0, "favorit-mail");
      if (!stille) {
        await supabase.from("listings").update({ favourites: Number(l.favourites ?? 0) + 1 }).eq("id", l.id);
      }
      handling = "favorit" + (stille ? "" : "; ♥ +1") + (synk ? "; " + synk : "");
    } else {
      handling = l ? "favorit; annoncen er " + l.status : "favorit; ingen annonce i appen passede";
    }
  } else if (kind === "besked") {
    // Koeber-assistenten skriver et udkast; det staar som opgave paa
    // forsiden. Afsendelsen er stadig dit tryk.
    const samtale = samtaleUrl(links);
    const ordene = laest?.besked ?? "";
    if (stille && await harKoeberRaekke(gemtId)) {
      handling = "besked (allerede behandlet)";
    } else if (ordene) {
      const p = (l?.published ?? {}) as Record<string, unknown>;
      baggrund((async () => {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/vinted-fill-script?key=${SHORTCUT_KEY}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "negotiate", platform: "vinted", listing: l?.id ?? null, buyerMessage: ordene, offer: 0,
            kilde: "mail", samtale, vintedMail: gemtId,
            item: { title: p.title || l?.title || titel, price: l?.price, description: p.description,
              brand: p.brand, size: p.size, condition: p.condition },
          }),
        });
        const svar = await res.json().catch(() => null);
        await push((titel || "En køber") + ": ny besked",
          "»" + ordene.slice(0, 90) + (ordene.length > 90 ? "…" : "") + "«" +
            (svar?.message ? " — svar klar i appen" : ""), "/vinted-udbakke/");
      })());
      handling = "besked; svar skrives";
    } else {
      await supabase.from("koeber_beskeder").insert({
        listing_id: l?.id ?? null, platform: "vinted", item_title: titel.slice(0, 200) || null,
        kilde: "mail", samtale, vinted_mail_id: gemtId,
      });
      await push("Ny besked på Vinted", titel ? "Om " + titel : (m.emne || ""), "/vinted-udbakke/");
      handling = "besked; mailen viste ikke ordene";
    }
  } else {
    // En slags, appen ikke bruger til noget endnu. Foerste gang den dukker op,
    // faar du en push, saa vi kan beslutte, hvad den skal bruges til (bestemt
    // af dig 9. oktober). "andet" er altid ny.
    const { count } = await supabase.from("vinted_mails").select("id", { count: "exact", head: true })
      .eq("kind", kind).neq("id", gemtId);
    if (kind === "andet" || !count) {
      await push("Ny slags mail fra Vinted", laest?.resume || m.emne || "Se mailen", "/vinted-udbakke/");
      handling = "ny slags: " + kind + " — meldt";
    } else {
      handling = kind;
    }
  }

  await supabase.from("vinted_mails").update({ handling }).eq("id", gemtId);
  return json({ ok: true, kind, listing: l?.id ?? null, handling });
});

async function harKoeberRaekke(mailId: number): Promise<boolean> {
  const { count } = await supabase.from("koeber_beskeder").select("id", { count: "exact", head: true })
    .eq("vinted_mail_id", mailId);
  return !!count;
}
