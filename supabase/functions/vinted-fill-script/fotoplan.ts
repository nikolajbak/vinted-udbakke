// Billeder lagt til og fjernet i appen, sendt til en annonce paa Vinted
// (bestemt af dig 19. oktober). Rene funktioner uden imports, saa de kan
// proeves med `node --test tools/test-fotoplan.mjs`.
//
// `kort` er annoncens par {id, rod} (listings.fotos), `venter` er roedderne
// i den raekkefoelge, appen vil have (pending.fotos), og `ids` er Vinteds
// billed-id'er, som annoncen har dem nu.

export type Kort = Array<{ id: string; rod: string }>;
export type Ny = { ny: string; url: string };
// `uden`: nye billeder uden en adresse - de kan aldrig laegges op og skal ud
// af listen, ellers venter den for evigt.
export type Plan = { oenske: Array<string | Ny>; fjern: string[]; nye: string[]; uden: string[] };

// Hvad runneren skal goere paa redigeringssiden:
// - et kendt billede, der staar paa Vinted: dets id paa sin plads
// - et billede, Vinted aldrig har haft: {ny, url} - det laegges op
// - et parret billede, du har slettet paa Vinted: springes over (ikke op igen)
// - et parret billede paa Vinted, som appen ikke vil have: i `fjern`
// Billeder, du har lagt til direkte paa Vinted (ukendte id'er), roeres ikke.
export function fotoPlan(kort: Kort, venter: string[], ids: string[], url: (rod: string) => string | null): Plan {
  const efterRod = new Map(kort.map((k) => [k.rod, k.id]));
  const paaVinted = new Set(ids);
  const vil = new Set(venter);
  const oenske: Array<string | Ny> = [], nye: string[] = [], uden: string[] = [];
  for (const r of venter) {
    const id = efterRod.get(r);
    if (id !== undefined) { if (paaVinted.has(id)) oenske.push(id); continue; }
    const u = url(r);
    if (u) { oenske.push({ ny: r, url: u }); nye.push(r); } else uden.push(r);
  }
  const fjern = kort.filter((k) => paaVinted.has(k.id) && !vil.has(k.rod)).map((k) => k.id);
  return { oenske, fjern, nye, uden };
}

// Staar listen paa Vinted? Intet fjernet tilbage, intet nyt mangler, og de
// faelles billeder i samme raekkefoelge. Et parret billede, der ikke er paa
// Vinted laengere, taeller ikke (du har slettet det dér).
export function fuldtSat(kort: Kort, venter: string[], ids: string[]): boolean {
  const efterId = new Map(kort.map((k) => [k.id, k.rod]));
  const kendt = new Set(kort.map((k) => k.rod));
  const vinted = ids.map((id) => efterId.get(id)).filter((r): r is string => !!r);
  const vil = new Set(venter);
  if (vinted.some((r) => !vil.has(r))) return false;
  if (venter.some((r) => !kendt.has(r))) return false;
  const paa = new Set(vinted);
  const x = venter.filter((r) => paa.has(r));
  return x.length === vinted.length && x.every((r, i) => r === vinted[i]);
}

// Runneren har lagt nye billeder op og meldt {rod, id}. Kun et id, der
// faktisk staar paa Vinted og ikke er parret i forvejen, og en rod, der ikke
// er parret i forvejen, kommer med.
export function medNye(kort: Kort, nye: unknown, ids: string[]): Kort {
  const paaVinted = new Set(ids);
  const ud = kort.slice();
  const brugtId = new Set(kort.map((k) => k.id)), brugtRod = new Set(kort.map((k) => k.rod));
  for (const n of Array.isArray(nye) ? nye : []) {
    const o = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
    const id = String(o.id ?? ""), r = String(o.rod ?? "");
    if (!/^\d{5,}$/.test(id) || !r || !paaVinted.has(id) || brugtId.has(id) || brugtRod.has(r)) continue;
    ud.push({ id, rod: r });
    brugtId.add(id); brugtRod.add(r);
  }
  return ud;
}

// Naar listen staar paa Vinted: et par, hvis billede er fjernet fra BAADE
// appen og annoncen, glemmes. Ellers ville det taelle som »slettet paa
// Vinted«, og laegges det tilbage i appen (Fortryd), kom det aldrig op igen.
export function glemFjernede(kort: Kort, venter: string[], ids: string[]): Kort {
  const vil = new Set(venter), paaVinted = new Set(ids);
  return kort.filter((k) => vil.has(k.rod) || paaVinted.has(k.id));
}
