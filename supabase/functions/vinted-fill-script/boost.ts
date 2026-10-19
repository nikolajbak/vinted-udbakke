// Betalt boost paa Vinted (bestemt af dig 19. oktober). Spec:
// docs/superpowers/specs/2026-10-19-betalt-annoncering-design.md
//
// Fakturaen (vinted-mail) er en ordre uden varer. Runneren spoerger
// mode 'boost' hoejst én gang i timen pr. fane:
//   {}                       -> {bruger, behov, maal}
//   {promoted: [item_id]}    -> varerne med promoted i garderoben knyttes til ordren
//   {maal: [{item_id, stats}]} -> Vinteds tal (bumps/stats) gemmes, dommen regnes
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { boostDom, boostLinje, boostSalg, EFTER_DAGE, type Tal } from "../_shared/annoncering.ts";

const DAG = 86400000;

type Raekke = Record<string, unknown>;

// Datoen i Koebenhavn (»2026-10-19«): én maaling pr. vare pr. dag.
function idag(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(d);
}

async function ordrerUdenVarer(supabase: SupabaseClient) {
  const { data: ordrer } = await supabase.from("annoncering_ordrer")
    .select("id, kr_i_alt, antal, dage, start, slut").eq("plads", "vinted")
    .gte("at", new Date(Date.now() - 7 * DAG).toISOString()).order("at", { ascending: true });
  if (!ordrer?.length) return [];
  const { data: rk } = await supabase.from("annoncering").select("ordre_id")
    .in("ordre_id", ordrer.map((o) => o.id));
  const har = new Map<number, number>();
  (rk ?? []).forEach((r) => har.set(r.ordre_id, (har.get(r.ordre_id) ?? 0) + 1));
  return ordrer.map((o) => ({ ...o, mangler: o.antal - (har.get(o.id) ?? 0) })).filter((o) => o.mangler > 0);
}

// Hvilke vinted-annoncer skal maales i dag: et boost, der koerer eller sluttede
// for under 7 dage siden, og intet maal i dag.
async function tilMaaling(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("annoncering")
    .select("listing_id, slut, maalt_at, listings(external_id, status)")
    .eq("plads", "vinted").not("listing_id", "is", null)
    .gte("slut", new Date(Date.now() - EFTER_DAGE * DAG).toISOString());
  const dag = idag();
  const ud = new Set<string>();
  for (const r of (data ?? []) as Raekke[]) {
    const l = r.listings as Raekke | null;
    if (!l?.external_id) continue;
    if (r.maalt_at && idag(new Date(String(r.maalt_at))) >= dag) continue;
    ud.add(String(l.external_id));
  }
  return [...ud];
}

async function knyt(supabase: SupabaseClient, promoted: string[]) {
  const ordrer = await ordrerUdenVarer(supabase);
  const knyttet: Array<{ nr: unknown; item_id: string; kr: number | null }> = [];
  if (!ordrer.length || !promoted.length) return knyttet;
  const { data: ls } = await supabase.from("listings")
    .select("id, draft_id, external_id, listed_at, next_check_at, drafts(nr)")
    .eq("platform", "vinted").in("external_id", promoted).order("listed_at", { ascending: false });
  const brugt = new Set<string>();
  for (const o of ordrer) {
    // En vare, der allerede har et boost, som overlapper ordrens periode, er
    // ikke ordrens (et aeldre boost, der stadig koerer).
    const { data: overlap } = await supabase.from("annoncering").select("listing_id")
      .eq("plads", "vinted").lt("start", o.slut).gt("slut", o.start);
    const optaget = new Set((overlap ?? []).map((r) => String(r.listing_id)));
    const kandidater = ((ls ?? []) as Raekke[])
      .filter((l) => l.draft_id && !optaget.has(String(l.id)) && !brugt.has(String(l.id)))
      .slice(0, o.mangler);
    const kr = o.kr_i_alt != null ? Math.round((Number(o.kr_i_alt) / o.antal) * 100) / 100 : null;
    for (const l of kandidater) {
      const { error } = await supabase.from("annoncering").insert({
        ordre_id: o.id, draft_id: l.draft_id, listing_id: l.id, plads: "vinted", slags: "boost",
        kr, start: o.start, slut: o.slut, kilde: "mail",
      });
      if (error) { console.error("boost: knyt", l.external_id, error.message); continue; }
      brugt.add(String(l.id));
      // Prisvagten holder sin ro, mens boostet koerer (og et doegn efter).
      const efter = new Date(new Date(o.slut).getTime() + DAG);
      if (new Date(String(l.next_check_at)) < efter) {
        await supabase.from("listings").update({ next_check_at: efter.toISOString() }).eq("id", l.id);
      }
      await supabase.from("price_events").insert({
        listing_id: l.id, kind: "boost",
        note: "boostet " + o.dage + " d" + (kr != null ? " (" + kr.toFixed(2).replace(".", ",") + " kr)" : ""),
      });
      knyttet.push({ nr: (l.drafts as Raekke | null)?.nr ?? null, item_id: String(l.external_id), kr });
    }
  }
  return knyttet;
}

function talAf(s: Raekke): Tal | null {
  const n = (k: string) => Number(s[k]);
  if (!Number.isFinite(n("impressions"))) return null;
  return {
    impressions: n("impressions"), views: n("views") || 0, favorites: n("favorites") || 0,
    conversations: n("conversations") || 0,
    forskel: Number.isFinite(n("impression_difference")) ? n("impression_difference") : null,
  };
}

async function gemMaal(supabase: SupabaseClient, maal: Array<{ item_id: unknown; stats: unknown }>) {
  let gemt = 0;
  const dag = idag();
  for (const m of maal) {
    const s = (m?.stats ?? null) as Raekke | null;
    const tal = s ? talAf(s) : null;
    if (!tal) continue;
    const { data: l } = await supabase.from("listings").select("id").eq("platform", "vinted")
      .eq("external_id", String(m.item_id)).maybeSingle();
    if (!l) continue;
    const { data: r } = await supabase.from("annoncering").select("id, maalt_at")
      .eq("listing_id", l.id).eq("plads", "vinted").order("start", { ascending: false }).limit(1).maybeSingle();
    if (!r) continue;
    if (r.maalt_at && idag(new Date(r.maalt_at)) >= dag) continue;
    const nu = new Date().toISOString();
    const { error } = await supabase.from("annoncering_maal").insert({
      annoncering_id: r.id, at: nu, impressions: tal.impressions, views: tal.views,
      favorites: tal.favorites, conversations: tal.conversations, forskel: tal.forskel,
      chart: Array.isArray(s!.chart_data) ? s!.chart_data : null,
    });
    if (error) { console.error("boost: maal", m.item_id, error.message); continue; }
    await supabase.from("annoncering").update({ tal, maalt_at: nu }).eq("id", r.id);
    gemt++;
  }
  return gemt;
}

// Dommen paa alle vinted-boost med tal - hver maales mod de andre. Regnes
// ved hvert kald, saa et salg eller et boost, der er slut, slaar igennem.
async function domme(supabase: SupabaseClient) {
  const { data } = await supabase.from("annoncering")
    .select("id, start, slut, tal, dom, listings(status, sold_at, sold_price)")
    .eq("plads", "vinted").not("tal", "is", null);
  const rk = (data ?? []) as Raekke[];
  for (const r of rk) {
    const l = (r.listings ?? {}) as Raekke;
    const solgt = l.status === "solgt" && boostSalg(r as { start: string; slut: string }, l.sold_at as string | null);
    const andre = rk.filter((x) => x.id !== r.id).map((x) => x.tal as Tal);
    const dom = boostDom(r.tal as Tal, andre, {
      solgt, solgtFor: solgt && l.sold_price != null ? Number(l.sold_price) : null, slut: String(r.slut),
    });
    if (dom !== r.dom) await supabase.from("annoncering").update({ dom }).eq("id", r.id);
  }
}

export async function boost(supabase: SupabaseClient, body: Raekke, bruger: string) {
  const ud: Raekke = {};
  if (Array.isArray(body.promoted)) {
    ud.knyttet = await knyt(supabase, (body.promoted as unknown[]).map(String));
  }
  if (Array.isArray(body.maal)) {
    ud.gemt = await gemMaal(supabase, body.maal as Array<{ item_id: unknown; stats: unknown }>);
  }
  await domme(supabase);
  if (!("knyttet" in ud) && !("gemt" in ud)) {
    ud.bruger = bruger;
    ud.behov = (await ordrerUdenVarer(supabase)).length > 0;
    ud.maal = await tilMaaling(supabase);
  }
  return ud;
}

// Prisvagten: de annoncer, hvis boost koerer lige nu, faar ingen tilsyn.
export async function boostKoerer(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("annoncering").select("listing_id")
    .not("listing_id", "is", null).gt("slut", new Date().toISOString()).lte("start", new Date().toISOString());
  return new Set((data ?? []).map((r) => String(r.listing_id)));
}

// Til prisvagtens prompt: det nyeste boost inden for 30 dage pr. annonce.
export async function boostLinjer(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const ud = new Map<string, string>();
  if (!ids.length) return ud;
  const { data } = await supabase.from("annoncering").select("listing_id, start, slut, kr, tal")
    .in("listing_id", ids).gte("slut", new Date(Date.now() - 30 * DAG).toISOString())
    .order("start", { ascending: false });
  for (const r of (data ?? []) as Raekke[]) {
    const id = String(r.listing_id);
    if (!ud.has(id)) {
      ud.set(id, boostLinje(r as { start: string; slut: string; kr: number | null; tal: Tal | null }, null));
    }
  }
  return ud;
}
