// Billedernes raekkefoelge mellem appen og Vinted (bestemt af dig 17. oktober).
//
// Appen kender sine billeder paa stien i Storage, Vinted paa et billed-id.
// De to parres én gang pr. annonce (listings.fotos): Vinteds id'er stiger i
// den raekkefoelge, billederne blev lagt op, saa sorteret id svarer til de
// billeder, der FAKTISK kom med ved udfyldningen (drafts.fotos_sendt).
//
// Et billede kendes paa sin rod - originalens sti. En manuel beskaering
// laegger en ny fil og gemmer originalen i `org`; det er stadig det samme
// billede paa Vinted.
//
// Lægger Vinted billederne op paa ny (Vinteds egen app goer det ved Gem),
// er der intet id at parre paa. Saa parres de paa selve billedet
// (fotohash.ts) - kun entydigt, ellers mærkes annoncen {udskiftet}.
//
// Raekkefoelgen gaar begge veje:
//   appen -> Vinted: dit traek laegger `pending.fotos` (roedderne i din
//     raekkefoelge); runneren laegger den i Vinteds eget Gem-kald.
//   Vinted -> appen: telefonen laeser annoncens billed-id'er i raekkefoelge,
//     og venter intet fra appen, flyttes udkastets billeder efter Vinted.
// Det er den eneste synkronisering, der skriver i udkastet: begge sider skal
// vise billederne i samme raekkefoelge, og der er kun én raekkefoelge.

import { genkend, type Vfoto } from "./fotohash.ts";
import { fotoPlan, fuldtSat, glemFjernede, medNye, type Ny } from "./fotoplan.ts";

// Noten, runneren faar skrevet, naar et nyt billede ikke kunne laegges op
// (mode fotoOp). To af dem for samme billede, og det tages ud af listen.
export const OP_FEJL = "billede kunne ikke lægges op på Vinted: ";

// deno-lint-ignore no-explicit-any
type Db = any;
type Foto = { path?: string; url?: string; org?: string; kind?: string };
type Kort = Array<{ id: string; rod: string }>;

export function rod(p: Foto | null | undefined): string {
  return String((p && (p.org || p.path)) || "");
}

// De billeder, der matcher, faar de pladser, der matchede billeder har i
// udkastet - i den nye raekkefoelge. De andre bliver staaende, hvor de er.
export function omordn(photos: Foto[], raekke: string[]): Foto[] | null {
  const kendt = new Set(raekke);
  const pladser: number[] = [];
  photos.forEach((p, i) => { if (kendt.has(rod(p))) pladser.push(i); });
  const efterRod = new Map(photos.map((p) => [rod(p), p]));
  const nye = raekke.filter((r) => efterRod.has(r));
  if (nye.length !== pladser.length) return null;
  const ud = photos.slice();
  pladser.forEach((plads, k) => { ud[plads] = efterRod.get(nye[k])!; });
  return ud.every((p, i) => p === photos[i]) ? null : ud;
}

// Annoncens billeder parret med udkastets. Uden et sikkert par: null og
// grunden — et forkert par ville flytte de forkerte billeder.
export function lavKort(ids: string[], sendt: string[]): Kort | null {
  const unikke = [...new Set(ids)];
  if (!unikke.length || unikke.length !== sendt.length) return null;
  const op = unikke.slice().sort((a, b) => Number(a) - Number(b));
  return op.map((id, i) => ({ id, rod: sendt[i] }));
}

// Telefonen sender id'er, eller {id, t} med Vinteds miniature (150x210),
// naar den har den — til genkendelsen, naar Vinted har lagt billederne op
// paa ny. Kun Vinteds egen billedserver hentes.
function rensFotos(ind: unknown): Vfoto[] {
  return (Array.isArray(ind) ? ind : []).map((x) => {
    const o = (x && typeof x === "object" ? x : { id: x }) as Record<string, unknown>;
    const t = typeof o.t === "string" && /^https:\/\/images\d*\.vinted\.net\//.test(o.t) ? o.t : undefined;
    return { id: String(o.id ?? "").trim(), url: t };
  }).filter((f) => /^\d{5,}$/.test(f.id)).slice(0, 40);
}

export type FotoSvar = {
  kort: boolean;
  grund?: string;
  pending: Record<string, unknown> | null;
  vinted?: string[];        // annoncens raekkefoelge (roedder)
  gemt?: boolean;           // en ventende raekkefoelge staar nu paa Vinted
  omordnet?: boolean;       // udkastet er flyttet efter Vinted
  genkendt?: boolean;       // parret paa billedernes indhold (fotohash.ts)
  // Vinteds id'er i den raekkefoelge, der venter; {ny, url} for et billede,
  // Vinted ikke har endnu (fotoplan.ts).
  oenske?: Array<string | Ny>;
  fjern?: string[];         // Vinteds id'er, appen har fjernet
};

// Telefonen har laest annoncens billed-id'er i Vinteds raekkefoelge.
// Parrer (foerste gang), noterer annoncens raekkefoelge, kvitterer en
// ventende raekkefoelge, eller flytter udkastet efter Vinted.
// `nye` er runnerens par {rod, id} for billeder, den lige har lagt op.
export async function fotoSynk(db: Db, listingId: string, idsInd: unknown, hvor: string, nye?: unknown): Promise<FotoSvar | null> {
  const vfotos = rensFotos(idsInd);
  const ids = vfotos.map((f) => f.id);
  const { data: l } = await db.from("listings")
    .select("id, draft_id, status, fotos, fotos_op, pending, published").eq("id", listingId).maybeSingle();
  if (!l) return null;
  const pending = (l.pending ?? null) as Record<string, unknown> | null;
  if (!ids.length || !l.draft_id) return { kort: !!l.fotos, pending };
  const { data: d } = await db.from("drafts")
    .select("id, nr, photos, fotos_sendt").eq("id", l.draft_id).maybeSingle();
  if (!d) return { kort: !!l.fotos, pending };
  const photos = (Array.isArray(d.photos) ? d.photos : []) as Foto[];

  let kort = (Array.isArray(l.fotos) ? l.fotos : null) as Kort | null;
  const opd: Record<string, unknown> = {};
  let genkendt = false;
  // Parret paa selve billederne: hver Vinted-miniature mod appens billeder
  // (fotohash.ts). Kun et entydigt par for hvert billede tæller.
  const genkendPaaBilledet = async (hvorfor: string): Promise<string | null> => {
    const app = photos.filter((p) => p && p.path).map((p) => ({ rod: rod(p), path: String(p.path) }));
    const g = await genkend(vfotos, app);
    if ("grund" in g) {
      console.log("fotos: genkendelse", l.id, hvorfor, g.grund);
      return g.grund;
    }
    kort = g.kort;
    opd.fotos = kort;
    genkendt = true;
    console.log("fotos: genkendt", l.id, hvorfor, JSON.stringify(g.afstande));
    await db.from("price_events").insert({
      listing_id: l.id, kind: "rettet",
      note: `billederne genkendt på Vinted (${hvorfor}): ${g.kort.length} af ${g.kort.length}`,
    });
    return null;
  };
  const udskiftet = !!(l.fotos && !Array.isArray(l.fotos) && (l.fotos as Record<string, unknown>).udskiftet);
  if (udskiftet) {
    // Én gang lagt op paa ny: kun billedernes indhold kan parre dem.
    const grund = await genkendPaaBilledet("efter ny upload");
    if (grund) return { kort: false, pending, grund: "Vinted har lagt billederne op på ny — " + grund };
  } else if (kort && !ids.some((id) => kort!.some((k) => k.id === id))) {
    // Vinted har lagt ALLE billeder op paa ny. Foerst genkendelsen; kan den
    // ikke parre entydigt, mærkes annoncen udskiftet.
    const gGrund = await genkendPaaBilledet("lagt op på ny");
    if (gGrund) {
      // Vinted har lagt ALLE billeder op paa ny: nye id'er og nye adresser
      // (17. oktober, nr. 55, efter billederne blev flyttet paa Vinted). De
      // nye id'er stiger i den raekkefoelge, Vinted viser NU — ikke i den, vi
      // sendte — saa de kan ikke parres paa pladsen. Hellere ingen
      // synkronisering end de forkerte billeder.
      const grund = "Vinted har lagt billederne op på ny — rækkefølgen kan ikke længere synkroniseres for denne annonce";
      const rest = pending ? { ...pending } : null;
      if (rest) delete rest.fotos;
      const tom = !rest || !Object.keys(rest).length;
      await db.from("listings").update({
        fotos: { udskiftet: new Date().toISOString() },
        published: { ...((l.published ?? {}) as Record<string, unknown>), fotos: null },
        ...(pending && pending.fotos
          ? { pending: tom ? null : rest, ...(tom ? { pending_note: null, pending_since: null } : {}) }
          : {}),
      }).eq("id", l.id);
      await db.from("price_events").insert({ listing_id: l.id, kind: "rettet", note: grund + " (" + gGrund + ")" });
      return { kort: false, pending: pending && pending.fotos ? (tom ? null : rest) : pending, grund };
    }
  }
  if (!kort) {
    // De billeder, der kom med op. Fra foer 17. oktober findes listen ikke;
    // dér er udkastets billeder med en adresse det bedste bud — de er alle
    // sendt, og ingen har kunnet flytte dem siden.
    const sendtStier = (d.fotos_sendt as Record<string, unknown> | null)?.vinted;
    const efterSti = new Map(photos.map((p) => [String(p.path ?? ""), p]));
    const sendt = Array.isArray(sendtStier) && sendtStier.length
      ? sendtStier.map((s) => rod(efterSti.get(String(s)) ?? { path: String(s) }))
      : photos.filter((p) => p && p.url).map(rod);
    kort = lavKort(ids, sendt);
    // Passer antallet ikke (nr. 57: 11 paa Vinted, 12 i appen), kan
    // billedernes indhold maaske parre dem.
    if (!kort && vfotos.every((f) => f.url)) await genkendPaaBilledet("antallet passer ikke");
    if (!kort) {
      const grund = `Vinted har ${new Set(ids).size} billeder, appen sendte ${sendt.length} — de kan ikke parres sikkert`;
      // En raekkefoelge, der aldrig kan sendes, maa ikke staa og sende
      // runneren til redigeringssiden igen og igen.
      if (pending && pending.fotos) {
        const rest = { ...pending };
        delete rest.fotos;
        const tom = !Object.keys(rest).length;
        await db.from("listings").update({
          pending: tom ? null : rest, ...(tom ? { pending_note: null, pending_since: null } : {}),
        }).eq("id", l.id);
        await db.from("price_events").insert({
          listing_id: l.id, kind: "rettet", note: "billederne kan ikke sendes: " + grund,
        });
        return { kort: false, pending: tom ? null : rest, grund };
      }
      return { kort: false, pending, grund };
    }
    opd.fotos = kort;
  }

  // Billeder, runneren har lagt op (bestemt af dig 19. oktober): fra
  // kvitteringen og fra listings.fotos_op, som runneren skriver straks efter
  // hver upload - foer Gem. Gik kvitteringen tabt, kendes id'et alligevel,
  // og billedet laegges ikke op to gange. Et par bruges, naar id'et staar paa
  // annoncen.
  const op = (Array.isArray(l.fotos_op) ? l.fotos_op : []) as Array<Record<string, unknown>>;
  const alleNye = [...(Array.isArray(nye) ? nye : []), ...op];
  if (alleNye.length) {
    const m = medNye(kort, alleNye, ids);
    if (m.length !== kort.length) { kort = m; opd.fotos = kort; }
    const kendtR = new Set(kort.map((k) => k.rod));
    const rest = op.filter((o) => !kendtR.has(String(o.rod ?? ""))).slice(-40);
    if (rest.length !== op.length) opd.fotos_op = rest.length ? rest : null;
  }
  const efterId = new Map(kort.map((k) => [k.id, k.rod]));
  const vinted = ids.map((id) => efterId.get(id)).filter((r): r is string => !!r);
  opd.published = { ...((l.published ?? {}) as Record<string, unknown>), fotos: vinted };

  const svar: FotoSvar = { kort: true, pending, vinted, ...(genkendt ? { genkendt } : {}) };
  let venter = pending && Array.isArray(pending.fotos) ? (pending.fotos as unknown[]).map(String) : null;
  const url = (r: string) => {
    const p = photos.find((x) => rod(x) === r);
    return p && p.url ? String(p.url) : null;
  };
  if (venter) {
    // Et nyt billede, der aldrig kan komme op - uden adresse, eller afvist to
    // gange - tages ud af listen. Ellers venter den for evigt, og runneren
    // gaar til redigeringssiden igen og igen.
    const forsoeg = new Map<string, number>();
    const { data: ev } = await db.from("price_events").select("note")
      .eq("listing_id", l.id).like("note", OP_FEJL + "%");
    for (const e of ev ?? []) {
      const r = String(e.note).slice(OP_FEJL.length);
      forsoeg.set(r, (forsoeg.get(r) ?? 0) + 1);
    }
    const foerPlan = fotoPlan(kort, venter, ids, url);
    const ud = [...foerPlan.uden, ...foerPlan.nye.filter((r) => (forsoeg.get(r) ?? 0) >= 2)];
    if (ud.length) {
      venter = venter.filter((r) => !ud.includes(r));
      const nyP = { ...pending!, fotos: venter };
      opd.pending = nyP;
      svar.pending = nyP;
      await db.from("price_events").insert({
        listing_id: l.id, kind: "rettet",
        note: `${ud.length} billede${ud.length === 1 ? "" : "r"} kunne ikke lægges op på Vinted og venter ikke længere`,
      });
    }
    // Et nyt billede, Vinted allerede har (en kvittering gik tabt), maa ikke
    // laegges op to gange: de ukendte billeder paa Vinted genkendes foerst
    // mod de nye (fotohash.ts). Kun et entydigt par taeller.
    const kendtRod = new Set(kort.map((k) => k.rod));
    const nyeRod = venter.filter((r) => !kendtRod.has(r));
    const ukendte = vfotos.filter((f) => !efterId.has(f.id));
    if (nyeRod.length && ukendte.length && ukendte.every((f) => f.url)) {
      const app = photos.filter((p) => p && p.path && nyeRod.includes(rod(p)))
        .map((p) => ({ rod: rod(p), path: String(p.path) }));
      const g = app.length ? await genkend(ukendte, app) : { grund: "ingen" };
      if (!("grund" in g)) {
        kort = [...kort, ...g.kort];
        opd.fotos = kort;
        for (const k of g.kort) efterId.set(k.id, k.rod);
        vinted.splice(0, vinted.length, ...ids.map((id) => efterId.get(id)).filter((r): r is string => !!r));
        opd.published = { ...((l.published ?? {}) as Record<string, unknown>), fotos: vinted };
        console.log("fotos: nye genkendt på Vinted", l.id, JSON.stringify(g.afstande));
      }
    }
    if (fuldtSat(kort, venter, ids)) {
      const glemt = glemFjernede(kort, venter, ids);
      if (glemt.length !== kort.length) { kort = glemt; opd.fotos = kort; }
      const rest = { ...pending! };
      delete rest.fotos;
      const tom = !Object.keys(rest).length;
      opd.pending = tom ? null : rest;
      if (tom) { opd.pending_note = null; opd.pending_since = null; }
      svar.pending = opd.pending as Record<string, unknown> | null;
      svar.gemt = true;
      await db.from("price_events").insert({
        listing_id: l.id, kind: "rettet", note: "sat på Vinted: billeder",
      });
    } else {
      const plan = fotoPlan(kort, venter, ids, url);
      svar.oenske = plan.oenske;
      if (plan.fjern.length) svar.fjern = plan.fjern;
    }
  } else if (l.status === "aktiv" || l.status === "pause") {
    const ny = omordn(photos, vinted);
    if (ny) {
      await db.from("drafts").update({
        photos: ny, image_path: ny[0]?.path ?? null, image_url: ny[0]?.url ?? null,
      }).eq("id", d.id);
      await db.from("price_events").insert({
        listing_id: l.id, kind: "rettet", note: "rettet på Vinted: billedrækkefølge (" + hvor + ")",
      });
      svar.omordnet = true;
    }
  }
  await db.from("listings").update(opd).eq("id", l.id);
  return svar;
}
