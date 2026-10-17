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
// Raekkefoelgen gaar begge veje:
//   appen -> Vinted: dit traek laegger `pending.fotos` (roedderne i din
//     raekkefoelge); runneren laegger den i Vinteds eget Gem-kald.
//   Vinted -> appen: telefonen laeser annoncens billed-id'er i raekkefoelge,
//     og venter intet fra appen, flyttes udkastets billeder efter Vinted.
// Det er den eneste synkronisering, der skriver i udkastet: begge sider skal
// vise billederne i samme raekkefoelge, og der er kun én raekkefoelge.

// deno-lint-ignore no-explicit-any
type Db = any;
type Foto = { path?: string; url?: string; org?: string; kind?: string };
type Kort = Array<{ id: string; rod: string }>;

export function rod(p: Foto | null | undefined): string {
  return String((p && (p.org || p.path)) || "");
}

// Er de to raekkefoelger ens paa de billeder, de har tilfaelles? Et billede,
// du har lagt til paa Vinted (eller som aldrig kom op), aendrer ikke ordenen.
export function sammeRaekke(a: string[], b: string[]): boolean {
  const A = new Set(a), B = new Set(b);
  const x = a.filter((r) => B.has(r)), y = b.filter((r) => A.has(r));
  return x.length === y.length && x.every((r, i) => r === y[i]);
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

// Vinteds billed-id'er i den raekkefoelge, du vil have dem.
export function idsFor(kort: Kort, raekke: string[]): string[] {
  const efterRod = new Map(kort.map((k) => [k.rod, k.id]));
  return raekke.map((r) => efterRod.get(r)).filter((x): x is string => !!x);
}

function rensIds(ids: unknown): string[] {
  return (Array.isArray(ids) ? ids : []).map((x) => String(x ?? "").trim())
    .filter((x) => /^\d{5,}$/.test(x)).slice(0, 40);
}

export type FotoSvar = {
  kort: boolean;
  grund?: string;
  pending: Record<string, unknown> | null;
  vinted?: string[];        // annoncens raekkefoelge (roedder)
  gemt?: boolean;           // en ventende raekkefoelge staar nu paa Vinted
  omordnet?: boolean;       // udkastet er flyttet efter Vinted
  oenske?: string[];        // Vinteds id'er i den raekkefoelge, der venter
};

// Telefonen har laest annoncens billed-id'er i Vinteds raekkefoelge.
// Parrer (foerste gang), noterer annoncens raekkefoelge, kvitterer en
// ventende raekkefoelge, eller flytter udkastet efter Vinted.
export async function fotoSynk(db: Db, listingId: string, idsInd: unknown, hvor: string): Promise<FotoSvar | null> {
  const ids = rensIds(idsInd);
  const { data: l } = await db.from("listings")
    .select("id, draft_id, status, fotos, pending, published").eq("id", listingId).maybeSingle();
  if (!l) return null;
  const pending = (l.pending ?? null) as Record<string, unknown> | null;
  if (!ids.length || !l.draft_id) return { kort: !!l.fotos, pending };
  const { data: d } = await db.from("drafts")
    .select("id, nr, photos, fotos_sendt").eq("id", l.draft_id).maybeSingle();
  if (!d) return { kort: !!l.fotos, pending };
  const photos = (Array.isArray(d.photos) ? d.photos : []) as Foto[];

  let kort = (Array.isArray(l.fotos) ? l.fotos : null) as Kort | null;
  const opd: Record<string, unknown> = {};
  if (kort && !ids.some((id) => kort!.some((k) => k.id === id))) {
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
    await db.from("price_events").insert({ listing_id: l.id, kind: "rettet", note: grund });
    return { kort: false, pending: pending && pending.fotos ? (tom ? null : rest) : pending, grund };
  }
  if (!kort) {
    // De billeder, der kom med op. Fra foer 17. oktober findes listen ikke;
    // dér er udkastets billeder med en adresse det bedste bud — de er alle
    // sendt, og ingen har kunnet flytte dem siden.
    // Er billederne én gang udskiftet paa Vinted (listings.fotos =
    // {udskiftet}), parres der aldrig igen paa pladsen.
    if (l.fotos && !Array.isArray(l.fotos) && (l.fotos as Record<string, unknown>).udskiftet) {
      return { kort: false, pending, grund: "Vinted har lagt billederne op på ny" };
    }
    const sendtStier = (d.fotos_sendt as Record<string, unknown> | null)?.vinted;
    const efterSti = new Map(photos.map((p) => [String(p.path ?? ""), p]));
    const sendt = Array.isArray(sendtStier) && sendtStier.length
      ? sendtStier.map((s) => rod(efterSti.get(String(s)) ?? { path: String(s) }))
      : photos.filter((p) => p && p.url).map(rod);
    kort = lavKort(ids, sendt);
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
          listing_id: l.id, kind: "rettet", note: "billedrækkefølgen kan ikke sendes: " + grund,
        });
        return { kort: false, pending: tom ? null : rest, grund };
      }
      return { kort: false, pending, grund };
    }
    opd.fotos = kort;
  }

  const efterId = new Map(kort.map((k) => [k.id, k.rod]));
  const vinted = ids.map((id) => efterId.get(id)).filter((r): r is string => !!r);
  opd.published = { ...((l.published ?? {}) as Record<string, unknown>), fotos: vinted };

  const svar: FotoSvar = { kort: true, pending, vinted };
  const venter = pending && Array.isArray(pending.fotos) ? (pending.fotos as unknown[]).map(String) : null;
  if (venter) {
    if (sammeRaekke(venter, vinted)) {
      const rest = { ...pending! };
      delete rest.fotos;
      const tom = !Object.keys(rest).length;
      opd.pending = tom ? null : rest;
      if (tom) { opd.pending_note = null; opd.pending_since = null; }
      svar.pending = opd.pending as Record<string, unknown> | null;
      svar.gemt = true;
      await db.from("price_events").insert({
        listing_id: l.id, kind: "rettet", note: "sat på Vinted: billedrækkefølge",
      });
    } else {
      svar.oenske = idsFor(kort, venter);
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
