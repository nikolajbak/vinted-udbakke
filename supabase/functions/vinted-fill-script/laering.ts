// Gennemgangen: hvad har de solgte varer til faelles, som de stille ikke har?
//
// Den koerer ugentligt (pg_cron, laering_puls), naar en vare bliver solgt, og
// naar du trykker i appen. Den skriver korte erfaringer i `laerdomme`, og de
// laegges ind i de prompter, der skriver annoncer og svarer koebere
// (_shared/laering.ts).
//
// Faa varer er mest tilfaeldighed. Derfor to spaerrer: gennemgangen siger
// "for tidligt", indtil der er noget at sammenligne, og en erfaring, der ikke
// peger paa mindst tre varer, smides vaek - uanset hvor overbevisende den lyder.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { BESKRIVELSE_REGLER } from "../_shared/beskrivelse.ts";
import { noterForbrug } from "../_shared/forbrug.ts";

const MIN_SOLGTE = 3;
const MIN_VURDERBARE = 6;    // solgt, eller ude i mindst STILLE_DAGE
const MIN_BESKEDER = 5;      // koebernes spoergsmaal kan laere noget foer salgene
const STILLE_DAGE = 14;
const MIN_VARER_PR_ERFARING = 3;

const OMRAADER = ["tekst", "pris", "billeder", "kommunikation"] as const;

const ERFARING_TOOL = {
  name: "angiv_erfaringer",
  description: "Angiv de erfaringer, gennemgangen fandt. Kald den også, når der ikke var noget at finde.",
  input_schema: {
    type: "object",
    properties: {
      overblik: {
        type: "string",
        description: "To-tre sætninger til sælgeren om, hvad tallene viser lige nu. Dansk, ærligt om usikkerheden.",
      },
      erfaringer: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            omraade: { type: "string", enum: [...OMRAADER] },
            tekst: {
              type: "string",
              description:
                "Instruksen, som den skal stå i prompten til den, der skriver næste annonce, sætter " +
                "prisen eller svarer en køber. Én-to sætninger, konkret, i bydeform.",
            },
            grundlag: {
              type: "string",
              description: "Hvad den bygger på, i én sætning til sælgeren: hvilke varer, og hvad der skilte dem ad.",
            },
            varer: {
              type: "array",
              items: { type: "integer" },
              description: "Løbenumrene på de varer, erfaringen bygger på. Mindst tre.",
            },
          },
          required: ["omraade", "tekst", "grundlag", "varer"],
        },
      },
    },
    required: ["overblik", "erfaringer"],
  },
};

const SYSTEM =
  "Du gennemgår en dansk genbrugssælgers egne annoncer på Vinted for at finde ud af, hvad der " +
  "virker for netop de varer — tekst, pris, billeder og svar til købere.\n\n" +
  "Sådan læses tallene:\n" +
  "- Solgt hurtigt er det bedste udfald. Solgt efter lang tid eller flere nedsættelser er et svagt " +
  "udfald. En vare, der har stået i over to uger uden salg, er et dårligt udfald.\n" +
  "- Mange hjerter uden salg betyder interesse, men for høj pris.\n" +
  "- Solgt på under to døgn til fuld pris tyder på, at prisen var for lav.\n" +
  "- Vinted skjuler solgte varer, så en markedsmedian er altid for høj. Ingen pris-erfaring må lægge " +
  "en pris over medianen af de sammenlignelige.\n" +
  "- Visninger findes ikke (Vinted giver altid 0). Brug dem ikke.\n\n" +
  "En erfaring skal:\n" +
  `- pege på mindst ${MIN_VARER_PR_ERFARING} varer, der kan bedømmes, ved løbenummer — ellers er den en ` +
  "tilfældighed. En vare markeret \"for tidligt at bedømme\" tæller ikke.\n" +
  "- SAMMENLIGNE: hvad har de solgte eller hurtige til fælles, som de stille ikke har? At beskrive " +
  "de solgte alene er ikke en erfaring. Findes trækket lige så meget blandt de stille varer, skiller " +
  "det ikke, og så er det ingen erfaring.\n" +
  "- være en konkret instruks, der kan bruges på NÆSTE vare: \"tekst\" og \"pris\" læses af den, der " +
  "skriver annoncen, \"kommunikation\" af den, der svarer købere, og \"billeder\" af sælgeren selv, " +
  "når varen fotograferes\n" +
  "- udtrykke en pris relativt (fx \"start 10-15 % under medianen for overtøj\"), aldrig som et fast " +
  "kronebeløb\n" +
  "- aldrig gå imod sælgerens faste regler herunder. De er sælgerens egne og står ikke til " +
  "diskussion — en erfaring må forfine dem, ikke ophæve dem.\n\n" +
  "Spørger flere købere om det samme, manglede det i teksten — det er en tekst-erfaring.\n\n" +
  "Den, der skriver annoncen, har kun billederne og de fakta, der automatisk er slået op (nypris og " +
  "mærkets mål, når de findes). Den kan ikke selv slå noget op eller måle. En instruks, der kræver " +
  "oplysninger, den ikke har, får den til at opfinde dem — skriv den ikke.\n\n" +
  "Få varer betyder meget tilfældighed. Find hellere ingen erfaringer end én, tallene ikke bærer, " +
  "og skriv grundlaget ærligt.\n\n" +
  "Sælgerens faste regler for annoncetekst:\n" + BESKRIVELSE_REGLER;

type Raekke = Record<string, unknown>;

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
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function laer(supabase: SupabaseClient, apiKey: string) {
  const { data: listings, error } = await supabase.from("listings")
    .select("id, draft_id, title, price, start_price, sold_price, status, listed_at, sold_at, favourites, published")
    .eq("platform", "vinted").limit(500);
  if (error) throw new Error(error.message);
  const lst = (listings ?? []) as Raekke[];

  const ids = lst.map((l) => l.id as string);
  const draftIds = lst.map((l) => l.draft_id).filter(Boolean) as string[];
  const [{ data: drafts }, { data: events }, { data: beskeder }, { data: fravalgt }] = await Promise.all([
    draftIds.length
      ? supabase.from("drafts").select(
        "id, nr, title, description, brand, size, condition, category_path, photos, fakta, price_grounded",
      ).in("id", draftIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("price_events").select("listing_id, at, kind, price, from_price, favourites, median")
        .in("listing_id", ids).order("at", { ascending: true }).limit(2000)
      : Promise.resolve({ data: [] }),
    supabase.from("koeber_beskeder").select("listing_id, item_title, buyer_message, offer, intent, emne")
      .order("at", { ascending: false }).limit(200),
    supabase.from("laerdomme").select("omraade, tekst").not("slaaet_fra", "is", null),
  ]);

  const draftAf = new Map(((drafts ?? []) as Raekke[]).map((d) => [d.id as string, d]));
  const ev = (events ?? []) as Raekke[];
  const msg = (beskeder ?? []) as Raekke[];

  const varer = lst.map((l) => {
    const d = draftAf.get(l.draft_id as string) ?? {};
    const pub = (l.published ?? {}) as Raekke;
    const egne = ev.filter((e) => e.listing_id === l.id);
    const solgt = l.status === "solgt";
    const ude = solgt ? dage(l.listed_at, l.sold_at) : dage(l.listed_at);
    const fakta = (d.fakta ?? {}) as Raekke;
    const fotos = Array.isArray(d.photos) ? d.photos as Raekke[] : [];
    const med = [...egne].reverse().find((e) => Number(e.median) > 0)?.median;
    return {
      nr: d.nr ?? null,
      solgt,
      ude,
      vurderbar: solgt || (l.status === "aktiv" && ude >= STILLE_DAGE),
      startpris: Number(l.start_price) || null,
      salgspris: solgt ? Number(l.sold_price ?? l.price) || null : null,
      salgsprisKendt: solgt && l.sold_price != null,
      linje: [
        `#${d.nr ?? "?"} ${pub.title ?? l.title ?? d.title ?? ""}`,
        `  udfald${solgt || (l.status === "aktiv" && ude >= STILLE_DAGE) ? "" : " (for tidligt at bedømme)"}: ${
          solgt ? `SOLGT efter ${ude} dage for ${l.sold_price ?? `${l.price} (sidste udbudspris, salgsprisen ukendt)`} kr`
          : l.status === "aktiv" ? `ikke solgt, ude i ${ude} dage` : `${l.status} efter ${ude} dage`
        } · ${l.favourites ?? 0} hjerter · startpris ${l.start_price} kr, nu ${l.price} kr · ` +
          `${egne.filter((e) => e.kind === "aendret").length} nedsættelser` +
          (med ? ` · seneste markedsmedian ${med} kr` : ""),
        `  vare: ${d.brand ?? "uden mærke"} · str. ${d.size ?? "?"} · ${d.condition ?? "?"} · ` +
          `${Array.isArray(d.category_path) ? (d.category_path as string[]).join(" › ") : "?"}` +
          (fakta.ny ? " · ny" : "") + (fakta.nypris ? ` · nypris ${fakta.nypris} kr nævnt` : "") +
          (fakta.maal ? " · mål nævnt" : " · ingen mål"),
        `  billeder: ${fotos.length} (${fotos.map((p) => p.kind ?? "?").join(", ")})`,
        `  tekst: ${String(pub.description ?? d.description ?? "").replace(/\s+/g, " ").slice(0, 700)}`,
        ...msg.filter((m) => m.listing_id === l.id).slice(0, 8).map((m) =>
          `  køber (${m.emne ?? "?"}): "${String(m.buyer_message ?? "").slice(0, 200)}"` +
          (m.offer ? ` · bød ${m.offer} kr` : "")
        ),
      ].join("\n"),
    };
  });

  const solgte = varer.filter((v) => v.solgt);
  const tal = {
    annoncer: varer.length,
    solgte: solgte.length,
    stille: varer.filter((v) => !v.solgt && v.vurderbar).length,
    vurderbare: varer.filter((v) => v.vurderbar).length,
    beskeder: msg.length,
    medianDageTilSalg: median(solgte.map((v) => v.ude)),
    // Kun de salg, hvor du har tastet prisen. Ellers maaler vi udbudsprisen
    // mod sig selv og faar 100 % hver gang.
    medianSalgAfStart: median(
      solgte.filter((v) => v.salgsprisKendt && v.startpris)
        .map((v) => Math.round((v.salgspris! / v.startpris!) * 100)),
    ),
  };

  const nok = (tal.solgte >= MIN_SOLGTE && tal.vurderbare >= MIN_VURDERBARE) ||
    tal.beskeder >= MIN_BESKEDER;
  if (!nok) {
    return {
      forTidligt: true,
      tal,
      mangler: `Der skal mindst ${MIN_SOLGTE} solgte varer og ${MIN_VURDERBARE} varer, der enten er solgt ` +
        `eller har stået ude i ${STILLE_DAGE} dage, før der er noget at sammenligne. ` +
        `Lige nu: ${tal.solgte} solgt, ${tal.vurderbare} at vurdere.`,
    };
  }

  const fravalgte = ((fravalgt ?? []) as Raekke[]).map((f) => `- (${f.omraade}) ${f.tekst}`);
  const brugt = varer.filter((v) => v.nr != null);
  const tekst =
    `${tal.annoncer} annoncer på Vinted, ${tal.solgte} solgt, ${tal.stille} har stået over ` +
    `${STILLE_DAGE} dage uden salg.` +
    (tal.medianDageTilSalg != null ? ` Median ${tal.medianDageTilSalg} dage til salg.` : "") +
    (tal.medianSalgAfStart != null ? ` De solgte gik for median ${tal.medianSalgAfStart} % af startprisen.` : "") +
    "\n\n" + brugt.map((v) => v.linje).join("\n\n") +
    (msg.filter((m) => !m.listing_id).length
      ? "\n\nKøberbeskeder uden kendt annonce:\n" + msg.filter((m) => !m.listing_id).slice(0, 30)
        .map((m) => `- (${m.emne ?? "?"}) ${m.item_title ?? ""}: "${String(m.buyer_message ?? "").slice(0, 200)}"`)
        .join("\n")
      : "") +
    (fravalgte.length
      ? "\n\nDisse erfaringer har sælgeren selv slået fra. Foreslå dem ikke igen, heller ikke omformuleret:\n" +
        fravalgte.join("\n")
      : "");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: SYSTEM,
      tools: [ERFARING_TOOL],
      tool_choice: { type: "tool", name: ERFARING_TOOL.name },
      messages: [{ role: "user", content: tekst }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  const data = await res.json();
  await noterForbrug(data, "laering");
  const blok = data.content?.find((b: { type?: string }) => b.type === "tool_use");
  const ud = (blok?.input ?? {}) as { overblik?: string; erfaringer?: unknown };
  // Modellen leverer af og til en indlejret liste som tekst - maalt paa
  // foerste proevekoersel. Laes den, eller regn med ingen.
  let raa: unknown = ud.erfaringer;
  if (typeof raa === "string") {
    try { raa = JSON.parse(raa); } catch { raa = []; }
  }
  const forslag = (Array.isArray(raa) ? raa : []) as Raekke[];

  // Serveren dommer, ikke modellen: en erfaring uden tre rigtige varer bag sig
  // kommer ikke ind i nogen prompt.
  const kendte = new Set(brugt.map((v) => Number(v.nr)));
  const vurderbare = new Set(brugt.filter((v) => v.vurderbar).map((v) => Number(v.nr)));
  const gyldige = forslag.map((e) => ({
    omraade: String(e.omraade),
    tekst: String(e.tekst ?? "").trim().slice(0, 400),
    grundlag: String(e.grundlag ?? "").trim().slice(0, 400),
    varer: [...new Set((Array.isArray(e.varer) ? e.varer : []).map(Number))].filter((n) => kendte.has(n)),
  })).filter((e) =>
    (OMRAADER as readonly string[]).includes(e.omraade) && e.tekst &&
    e.varer.filter((n) => vurderbare.has(n)).length >= MIN_VARER_PR_ERFARING
  );

  // De aktive erstattes af den nye gennemgang; dem, du har slaaet fra, bliver
  // staaende, saa de kan vises og ikke foreslaas igen.
  const { error: sletFejl } = await supabase.from("laerdomme").delete().is("slaaet_fra", null);
  if (sletFejl) throw new Error(sletFejl.message);
  if (gyldige.length) {
    const { error: indFejl } = await supabase.from("laerdomme").insert(gyldige);
    if (indFejl) throw new Error(indFejl.message);
  }

  return {
    forTidligt: false,
    tal,
    overblik: String(ud.overblik ?? "").trim(),
    erfaringer: gyldige,
    kasseret: forslag.length - gyldige.length,
  };
}
