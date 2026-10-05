// Indkoebet: hvilke UBRUGTE varer har dine egne salg vist, at det er let at
// saelge igen? Svaret gives paa to niveauer - kategori (varetypen, fx
// "Jakker") og produkt (maerke + varetype, fx "Teeshoppen · Jakker") - med de
// enkelte varer under hvert produkt.
//
// Kun dine egne annoncer taeller, ikke Vinted som helhed (bestemt af dig
// 5. oktober). Tallene regnes her i koden; modellen skriver kun den korte
// anbefaling ud fra dem og maa ikke naevne et produkt, der ikke staar i
// tabellen.
//
// Samme spaerre som gennemgangen af salgene (laering.ts): en vare kan kun
// bedoemmes, naar den er solgt eller har staaet ude i STILLE_DAGE. En gruppe
// uden en eneste bedoemt vare faar dommen "for tidligt", ikke "traeg".

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { erNy, helKroner } from "../_shared/pris.ts";

const STILLE_DAGE = 14;
const HURTIG_DAGE = 7;          // solgt inden for en uge = "saelger let"
const LOVENDE_HJERTER_PR_DAG = 0.5;

type Raekke = Record<string, unknown>;

export type Dom = "let" | "saelger" | "lovende" | "traeg" | "tidligt";

function dage(fra: unknown, til?: unknown): number {
  const a = new Date(String(fra ?? "")).getTime();
  const b = til ? new Date(String(til)).getTime() : Date.now();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function median(tal: number[]): number | null {
  const s = tal.filter((n) => isFinite(n)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

// "TEESHOPPEN" og "Teeshoppen" er det samme maerke. Vist med den stavemaade,
// der ikke er raabt - ellers den, der staar flest gange.
function maerkeNoegle(b: unknown): string {
  return String(b ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function paenNavn(stavninger: string[]): string {
  const ikkeRaabt = stavninger.filter((s) => s !== s.toUpperCase() || s.length <= 3);
  const kilde = ikkeRaabt.length ? ikkeRaabt : stavninger;
  const tael = new Map<string, number>();
  kilde.forEach((s) => tael.set(s, (tael.get(s) ?? 0) + 1));
  return [...tael.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function kategoriAf(d: Raekke): string {
  const k = String(d.category ?? "").trim();
  if (k) return k;
  const sti = Array.isArray(d.category_path) ? d.category_path as string[] : [];
  return String(sti[sti.length - 1] ?? "").trim() || "Uden kategori";
}

type Vare = {
  nr: number | null;
  titel: string;
  maerke: string;
  maerkeNoegle: string;
  kategori: string;
  stand: string;
  ny: boolean;
  solgt: boolean;
  status: string;
  dage: number;
  vurderbar: boolean;
  hjerter: number;
  hjerterPrDag: number;
  startpris: number | null;
  pris: number | null;
  salgspris: number | null;
  salgsprisKendt: boolean;
  nypris: number | null;
  andelAfNypris: number | null;   // salgspris (eller nuvaerende pris) i % af nyprisen
  nedsaettelser: number;
  udfald: string;
};

type Gruppe = {
  navn: string;
  kategori?: string;
  maerke?: string;
  varer: number;
  solgt: number;
  vurderbare: number;
  salgsrate: number | null;          // solgt / vurderbare, i %
  medianDageTilSalg: number | null;
  medianSalgspris: number | null;
  medianAfNypris: number | null;
  hjerterPrDag: number | null;       // median blandt dem, der stadig er ude
  dom: Dom;
  sikkerhed: string;
  point: number;
  nr: number[];
};

function dom(g: { solgt: number; vurderbare: number; medianDageTilSalg: number | null; hjerterPrDag: number | null }): Dom {
  if (g.solgt > 0) {
    const rate = g.solgt / Math.max(1, g.vurderbare);
    return g.medianDageTilSalg != null && g.medianDageTilSalg <= HURTIG_DAGE && rate >= 0.5 ? "let" : "saelger";
  }
  if (g.hjerterPrDag != null && g.hjerterPrDag >= LOVENDE_HJERTER_PR_DAG) return "lovende";
  if (g.vurderbare > 0) return "traeg";
  return "tidligt";
}

function sikkerhed(vurderbare: number): string {
  if (vurderbare === 0) return "intet bedømt endnu";
  if (vurderbare === 1) return "én vare — et fingerpeg, ikke et mønster";
  if (vurderbare < 4) return `${vurderbare} varer — tyndt`;
  return `${vurderbare} varer`;
}

// Til rangeringen: salgsraten trukket mod 50 % (to tænkte varer, en solgt og
// en ikke), saa én solgt ud af én ikke slaar tre ud af fire. Hurtige salg
// vaegter op, og interesse paa det, der ikke kan bedoemmes endnu, giver lidt.
function point(solgt: number, vurderbare: number, medDage: number | null, hjDag: number | null): number {
  const rate = (solgt + 1) / (vurderbare + 2);
  const fart = medDage == null ? 0.4 : HURTIG_DAGE / (HURTIG_DAGE + medDage);
  const interesse = Math.min(1, (hjDag ?? 0) / (LOVENDE_HJERTER_PR_DAG * 2));
  return Math.round(100 * (0.6 * rate + 0.3 * fart * (solgt ? 1 : 0) + 0.1 * interesse));
}

function samle(navn: string, vs: Vare[], ekstra: Partial<Gruppe> = {}): Gruppe {
  const solgte = vs.filter((v) => v.solgt);
  const vurderbare = vs.filter((v) => v.vurderbar).length;
  const medDage = median(solgte.map((v) => v.dage));
  const hjDag = median(vs.filter((v) => !v.solgt && v.status === "aktiv").map((v) => v.hjerterPrDag));
  const g = {
    navn,
    ...ekstra,
    varer: vs.length,
    solgt: solgte.length,
    vurderbare,
    salgsrate: vurderbare ? Math.round((solgte.length / vurderbare) * 100) : null,
    medianDageTilSalg: medDage,
    medianSalgspris: median(solgte.map((v) => v.salgspris ?? NaN)),
    medianAfNypris: median(solgte.map((v) => v.andelAfNypris ?? NaN)),
    hjerterPrDag: hjDag,
    nr: vs.map((v) => v.nr).filter((n): n is number => n != null).sort((a, b) => a - b),
  };
  return {
    ...g,
    dom: dom(g),
    sikkerhed: sikkerhed(vurderbare),
    point: point(g.solgt, vurderbare, medDage, hjDag),
  };
}

const DOM_TEKST: Record<Dom, string> = {
  let: "sælger let", saelger: "sælger", lovende: "lovende", traeg: "træg", tidligt: "for tidligt",
};

const DOM_ORDEN: Dom[] = ["let", "saelger", "lovende", "tidligt", "traeg"];
function sorter(a: Gruppe, b: Gruppe): number {
  return DOM_ORDEN.indexOf(a.dom) - DOM_ORDEN.indexOf(b.dom) || b.point - a.point || b.varer - a.varer;
}

const ANBEFALING_TOOL = {
  name: "angiv_anbefaling",
  description: "Giv sælgeren en kort anbefaling om, hvilke ubrugte varer der er værd at købe ind igen.",
  input_schema: {
    type: "object",
    properties: {
      overblik: {
        type: "string",
        description: "To-fire sætninger på dansk. Hvad tallene viser om de ubrugte varer, og hvor sikkert det er.",
      },
      koebIgen: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            navn: { type: "string", description: "Produktets navn PRÆCIS som i tabellen, fx \"Teeshoppen · Jakker\"." },
            hvorfor: { type: "string", description: "Én sætning med tallene bag." },
          },
          required: ["navn", "hvorfor"],
        },
      },
      ladVaere: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            navn: { type: "string", description: "Produktets eller kategoriens navn PRÆCIS som i tabellen." },
            hvorfor: { type: "string", description: "Én sætning med tallene bag." },
          },
          required: ["navn", "hvorfor"],
        },
      },
    },
    required: ["overblik", "koebIgen", "ladVaere"],
  },
};

const SYSTEM =
  "Du hjælper en dansk genbrugssælger med at beslutte, hvilke UBRUGTE varer (nye, med eller uden " +
  "prismærke) det er værd at købe ind og sælge igen på Vinted. Du får sælgerens EGNE salg, regnet " +
  "ud pr. kategori og pr. produkt (mærke + varetype). Andet grundlag har du ikke.\n\n" +
  "Sådan læses tallene:\n" +
  `- En vare kan kun bedømmes, når den er solgt eller har været ude i ${STILLE_DAGE} dage. ` +
  "\"For tidligt\" er hverken godt eller skidt.\n" +
  `- Solgt inden for ${HURTIG_DAGE} dage er let. Mange hjerter uden salg er interesse, ikke salg.\n` +
  "- \"% af nypris\" siger, hvor meget af nyprisen salget hentede hjem — jo højere, jo mere er der " +
  "at tjene på et indkøb. Indkøbsprisen kender du ikke; regn ikke på fortjeneste.\n" +
  "- Få varer er mest tilfældighed. Skriv ærligt, hvor tyndt det er. Anbefal hellere intet end et " +
  "produkt, tallene ikke bærer. Et produkt med én solgt vare er et fingerpeg — sig det.\n" +
  "- Nævn kun produkter og kategorier, der står i tabellen, med præcis det navn. Opfind ingen tal — " +
  "står der ingen \"% af nypris\", så nævn ikke nyprisen.\n" +
  "- \"Køb igen\" er kun for dem med dommen sælger let, sælger eller lovende. \"Lad være\" er kun for " +
  "dem med dommen træg. Et produkt, der er for tidligt at bedømme, hører ingen af stederne.";

export async function indkob(supabase: SupabaseClient, apiKey: string) {
  const { data: listings, error } = await supabase.from("listings")
    .select("id, draft_id, title, price, start_price, sold_price, status, listed_at, sold_at, favourites, published")
    .eq("platform", "vinted").limit(1000);
  if (error) throw new Error(error.message);
  const lst = (listings ?? []) as Raekke[];

  const ids = lst.map((l) => l.id as string);
  const draftIds = lst.map((l) => l.draft_id).filter(Boolean) as string[];
  const [{ data: drafts }, { data: events }] = await Promise.all([
    draftIds.length
      ? supabase.from("drafts").select("id, nr, title, brand, condition, category, category_path, fakta")
        .in("id", draftIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("price_events").select("listing_id, kind").in("listing_id", ids).limit(5000)
      : Promise.resolve({ data: [] }),
  ]);
  const draftAf = new Map(((drafts ?? []) as Raekke[]).map((d) => [d.id as string, d]));
  const nedsat = new Map<string, number>();
  ((events ?? []) as Raekke[]).forEach((e) => {
    if (e.kind === "aendret") nedsat.set(e.listing_id as string, (nedsat.get(e.listing_id as string) ?? 0) + 1);
  });

  // Taget ned uden salg er hverken solgt eller stille - den fortaeller intet
  // om, hvor let varen saelger.
  const alle: Vare[] = lst.filter((l) => l.status !== "afsluttet").map((l) => {
    const d = draftAf.get(l.draft_id as string) ?? {};
    const pub = (l.published ?? {}) as Raekke;
    const fakta = (d.fakta ?? {}) as Raekke;
    const solgt = l.status === "solgt";
    const ude = solgt ? dage(l.listed_at, l.sold_at) : dage(l.listed_at);
    const hjerter = Number(l.favourites) || 0;
    const salgspris = solgt ? (Number(l.sold_price ?? l.price) || null) : null;
    const np = helKroner(fakta.nypris);
    const nypris = isFinite(np) && np > 0 ? np : null;
    const grundPris = salgspris ?? (Number(l.price) || null);
    const vurderbar = solgt || (l.status === "aktiv" && ude >= STILLE_DAGE);
    return {
      nr: (d.nr as number) ?? null,
      titel: String(pub.title ?? l.title ?? d.title ?? ""),
      maerke: String(d.brand ?? pub.brand ?? "").trim() || "Uden mærke",
      maerkeNoegle: maerkeNoegle(d.brand ?? pub.brand) || "uden mærke",
      kategori: kategoriAf(d),
      stand: String(d.condition ?? ""),
      ny: erNy(d.fakta, d.condition),
      solgt,
      status: String(l.status ?? ""),
      dage: ude,
      vurderbar,
      hjerter,
      hjerterPrDag: Math.round((hjerter / Math.max(1, ude)) * 100) / 100,
      startpris: Number(l.start_price) || null,
      pris: Number(l.price) || null,
      salgspris,
      salgsprisKendt: solgt && l.sold_price != null,
      nypris,
      andelAfNypris: nypris && grundPris ? Math.round((grundPris / nypris) * 100) : null,
      nedsaettelser: nedsat.get(l.id as string) ?? 0,
      udfald: solgt
        ? `solgt efter ${ude} ${ude === 1 ? "dag" : "dage"}` +
          (salgspris ? ` for ${salgspris} kr${l.sold_price == null ? " (udbudspris)" : ""}` : "")
        : l.status === "aktiv"
        ? `ude i ${ude} ${ude === 1 ? "dag" : "dage"}${vurderbar ? "" : " — for tidligt at bedømme"}`
        : String(l.status ?? ""),
    };
  });

  const nye = alle.filter((v) => v.ny);
  const brugte = alle.filter((v) => !v.ny);

  // Kategori: varetypen. Produkt: maerke + varetype.
  const efterKat = new Map<string, Vare[]>();
  nye.forEach((v) => efterKat.set(v.kategori, [...(efterKat.get(v.kategori) ?? []), v]));
  const kategorier = [...efterKat.entries()].map(([k, vs]) => samle(k, vs)).sort(sorter);

  const efterProd = new Map<string, Vare[]>();
  nye.forEach((v) => {
    const n = v.maerkeNoegle + "\u0000" + v.kategori;
    efterProd.set(n, [...(efterProd.get(n) ?? []), v]);
  });
  const produkter = [...efterProd.values()].map((vs) => {
    const maerke = paenNavn(vs.map((v) => v.maerke));
    return {
      ...samle(`${maerke} · ${vs[0].kategori}`, vs, { maerke, kategori: vs[0].kategori }),
      enkelte: vs.sort((a, b) => Number(b.solgt) - Number(a.solgt) || a.dage - b.dage).map((v) => ({
        nr: v.nr, titel: v.titel, stand: v.stand, udfald: v.udfald, hjerter: v.hjerter,
        salgspris: v.salgspris, nypris: v.nypris, andelAfNypris: v.andelAfNypris,
        nedsaettelser: v.nedsaettelser, solgt: v.solgt, vurderbar: v.vurderbar,
      })),
    };
  }).sort(sorter);

  const helhed = samle("Ubrugte varer", nye);
  const sammenligning = samle("Brugte varer", brugte);

  let anbefaling: { overblik: string; koebIgen: Raekke[]; ladVaere: Raekke[] } | null = null;
  let anbefalingFejl: string | null = null;
  // Uden et eneste bedoemt nyt salg er der intet at anbefale ud fra - saa
  // skal modellen ikke have lov at finde paa noget.
  if (helhed.vurderbare > 0 && apiKey) {
    const linje = (g: Gruppe) =>
      `- ${g.navn}: ${g.varer} varer, ${g.solgt} solgt af ${g.vurderbare} bedømte` +
      (g.medianDageTilSalg != null ? `, median ${g.medianDageTilSalg} dage til salg` : "") +
      (g.medianSalgspris != null ? `, median salgspris ${g.medianSalgspris} kr` : "") +
      (g.medianAfNypris != null ? ` (${g.medianAfNypris} % af nypris)` : "") +
      (g.hjerterPrDag != null ? `, ${g.hjerterPrDag} hjerter/dag på dem, der er ude` : "") +
      ` → ${DOM_TEKST[g.dom]} (${g.sikkerhed})`;
    const tekst =
      `Ubrugte varer i alt: ${linje(helhed).slice(2)}\n` +
      `Til sammenligning, brugte varer: ${linje(sammenligning).slice(2)}\n\n` +
      `Kategorier:\n${kategorier.map(linje).join("\n")}\n\n` +
      `Produkter (mærke · varetype):\n${produkter.map((p) =>
        linje(p) + "\n" + p.enkelte.map((v) =>
          `    #${v.nr ?? "?"} ${v.titel} — ${v.udfald}, ${v.hjerter} hjerter` +
          (v.nypris ? `, nypris ${v.nypris} kr` : "") +
          (v.nedsaettelser ? `, ${v.nedsaettelser} nedsættelser` : "")
        ).join("\n")
      ).join("\n")}`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 1500,
          system: SYSTEM,
          tools: [ANBEFALING_TOOL],
          tool_choice: { type: "tool", name: ANBEFALING_TOOL.name },
          messages: [{ role: "user", content: tekst }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic_error_${res.status}`);
      const blok = (await res.json()).content?.find((b: { type?: string }) => b.type === "tool_use");
      const ud = (blok?.input ?? {}) as Raekke;
      // Samme greb som laering.ts: en liste kan komme som tekst.
      const liste = (x: unknown): Raekke[] => {
        if (typeof x === "string") { try { x = JSON.parse(x); } catch { x = []; } }
        return Array.isArray(x) ? x as Raekke[] : [];
      };
      // Serveren dommer: kun navne, der staar i tabellen.
      // Serveren dommer, ikke modellen: kun navne, der staar i tabellen, og
      // kun med en dom, der passer. Paa foerste proeve lagde modellen tre
      // varer, der var fire dage gamle, under "lad vaere".
      const domAf = new Map<string, Dom>([...kategorier, ...produkter].map((g) => [g.navn, g.dom]));
      const rens = (xs: Raekke[], tilladt: Dom[]) => xs
        .map((x) => ({ navn: String(x.navn ?? "").trim(), hvorfor: String(x.hvorfor ?? "").trim().slice(0, 300) }))
        .filter((x) => tilladt.includes(domAf.get(x.navn) as Dom));
      anbefaling = {
        overblik: String(ud.overblik ?? "").trim().slice(0, 800),
        koebIgen: rens(liste(ud.koebIgen), ["let", "saelger", "lovende"]),
        ladVaere: rens(liste(ud.ladVaere), ["traeg"]),
      };
    } catch (e) {
      // Tallene er svaret; anbefalingen er pynt. En fejl her maa ikke tage
      // tabellen med sig.
      anbefalingFejl = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    regler: { stilleDage: STILLE_DAGE, hurtigDage: HURTIG_DAGE },
    helhed,
    sammenligning,
    kategorier,
    produkter,
    anbefaling,
    anbefalingFejl,
  };
}
