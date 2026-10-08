// Reglerne for en annoncetekst. Fire kald skriver en beskrivelse - analysen,
// Vinteds markedsrunde, DBA og Reshopper - og hver af dem havde sin egen
// formulering. Saa sagde den ene "bytter ved koeb af flere", den anden
// "uden synlige pletter", og en rettelse ét sted naaede aldrig de tre andre.
// Nu staar reglerne her, og alle fire laeser dem.

export const BESKRIVELSE_REGLER =
  "Regler for beskrivelsen:\n" +
  "- Skriv positivt og varmt, med positive superlativer, hvor varen fortjener dem: \"smuk\", " +
  "\"skøn\", \"super lækker kvalitet\", \"perfekt til\". Stadig konkret om mærke, størrelse, " +
  "materiale og pasform — det positive skal hvile på noget, køberen kan se. Højst ét udråbstegn.\n" +
  "- Er varen ny, så sig det tydeligt i første linje: \"Helt ny med prismærke\" eller " +
  "\"Helt ny og aldrig brugt\". Er nyprisen oplyst under Fakta, så skriv den med: \"Nypris 599,00 kr.\" " +
  "Står den der ikke, så nævn ingen nypris — opfind aldrig et tal.\n" +
  "- Er der mål under Fakta, så skriv dem med, og sig hvor de kommer fra, hvis det er mærkets " +
  "størrelsesguide (\"Ifølge mærkets størrelsesguide passer den til brystvidde 88-92 cm\"). " +
  "Bed aldrig køberen spørge efter mål, og tilbyd aldrig at måle op eller tage flere billeder.\n" +
  "- Fejl: nævn kun en fejl, der står under Fakta, eller som du er helt sikker på ud fra " +
  "billederne og som en køber ville se med det samme. Én kort, rolig sætning sidst i teksten — " +
  "ikke først, og uden at gøre den større end den er. Skygger, folder, krøl, lysrefleks, fnug fra " +
  "underlaget og almindeligt vaskepræg er IKKE fejl. Gæt aldrig (\"muligvis\", \"evt. en lille plet\").\n" +
  "- Uden fejl: sig det positivt — \"står flot\", \"i rigtig fin stand\", \"pæn og velholdt\". " +
  "Skriv ALDRIG \"uden synlige huller\", \"ingen synlige pletter\", \"umiddelbart\" eller \"så vidt " +
  "jeg kan se\": det lyder, som om der er fejl, man bare ikke kan se.\n" +
  "- Viser billederne flere ting, der sælges samlet (fx en kjole og et par leggings), så nævn " +
  "HVER del i titlen og beskriv hver af dem i teksten — en del, der ikke nævnes, er ikke solgt.\n" +
  "- Står materialet på vaskemærket (fx \"95% bomuld, 5% elastan\"), så skriv det præcis sådan.\n" +
  "- Skriv aldrig noget om bytte.\n" +
  "- En pris skrives altid som hele kroner med komma og to nuller: \"599,00 kr\", aldrig \"599 kr\" eller \"599,-\".\n" +
  "- Slut med ét kort stylingforslag: hvad varen er skøn sammen med, eller hvor den passer ind " +
  "(\"Skøn med hvide sneakers og en oversized blazer\"). Til børnetøj må det gerne være legepladsen " +
  "eller fødselsdagen.\n" +
  "- Opfind aldrig egenskaber, billederne og Fakta ikke bærer — heller ikke om pasformen.\n" +
  "- Del teksten i 3-4 korte afsnit med en tom linje imellem; ét langt afsnit læses ikke på en telefon.\n" +
  "- Titlen skrives aldrig udelukkende med store bogstaver — almindelig skrift, stort begyndelsesbogstav " +
  "og mærket stavet som mærket selv gør (\"Name It vinterjakke str. 110\", ikke \"NAME IT VINTERJAKKE STR. 110\").";

// En titel kun af versaler raabes. Reglen staar i prompten, men en model,
// der har set et maerke skrevet med versaler, gentager det gerne - saa
// titlen rettes ogsaa her, efter modellen. Kun naar der INTET lille bogstav
// er: et maerke som "ONLY" foran almindelige ord er ikke en raabende titel.
// Stoerrelser (XS, XL, 2XL) og ord med tal eller & (H&M) bliver staaende.
export function ingenVersaler(titel: string, maerke?: unknown): string {
  const t = String(titel ?? "");
  if (!/\p{Lu}/u.test(t) || /\p{Ll}/u.test(t)) return t;
  const behold = (o: string) => /[\d&]/.test(o) || /^(X{0,3}S|M|X{0,3}L)$/.test(o);
  let ud = t.split(/(\s+)/).map((o) => behold(o) ? o : o.toLocaleLowerCase("da-DK")).join("");
  const m = String(maerke ?? "").trim();
  if (m.length >= 2) {
    const stavet = /\p{Ll}/u.test(m)
      ? m
      : m.split(/(\s+)/).map((o) => behold(o) ? o : o.charAt(0) + o.slice(1).toLocaleLowerCase("da-DK")).join("");
    const esc = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    ud = ud.replace(new RegExp(esc, "iu"), stavet);
  }
  return ud.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("da-DK"));
}

// Det, der er slaaet op om varen, gemt i drafts.fakta. Det skal overleve, at
// beskrivelsen skrives om tre gange mere: lever nyprisen kun i teksten, kan
// markedsrunden skrive den ud igen uden at vide, at den var slaaet op.
export type Fakta = {
  ny?: boolean;
  nypris?: number;
  nyprisKilde?: string;
  maal?: string;
  maalKilde?: string;
  fejl?: string;
  // Det, der staar paa haenge-, pris- og nakkemaerket: varenummer, modelnavn,
  // farvenavn, stregkode. Kun til opslaget - det skrives ikke i annoncen.
  maerker?: string;
  // Farvenavnet paa haenge-/prismaerket ("Army"). Facit for farven i titel,
  // tekst og Vinteds farvefelt - et foto kan snyde paa lys og hvidbalance.
  maerkeFarve?: string;
  // Materialet som det staar paa vaskemaerket ("95% bomuld, 5% elastan").
  // Facit for materialet - et foto kan ikke se forskel paa bomuld og viskose.
  materialer?: string;
  // Hver del, naar billederne viser flere ting, der saelges samlet (nr. 47:
  // en sweatkjole og et par leggings - kun kjolen blev beskrevet).
  dele?: string[];
  // Andet, der staar tydeligt paa maerkerne: oekologisk, GOTS, vandsoejle ...
  egenskaber?: string;
  // Plaggets egne maal i cm til Vinteds felter »Længde« og »Skulderbredde«.
  // Kun trykt paa et maerkat, slaaet op paa varens egen produktside, eller
  // tastet af dig - aldrig skoennet ud fra et foto.
  laengde?: number;
  skulderbredde?: number;
  plagMaalKilde?: string;
};

export function faktaTekst(f: unknown): string {
  const k = (f && typeof f === "object" ? f : {}) as Fakta;
  const linjer = [
    k.ny && "Varen er ny.",
    k.nypris && `Nypris: ${Math.round(Number(k.nypris))},00 kr${k.nyprisKilde ? ` (${k.nyprisKilde})` : ""}`,
    k.maal && `Mål: ${k.maal}${k.maalKilde ? ` (${k.maalKilde})` : ""}`,
    k.maerkeFarve && `Farve ifølge mærket: ${k.maerkeFarve}. Brug den farve (på dansk) i titel og tekst, også hvis billedet ser anderledes ud, og vælg den nærmeste i Vinteds farveliste.`,
    k.dele?.length && `Sælges samlet: ${k.dele.join(" + ")}. Nævn hver del i titel og tekst.`,
    k.materialer && `Materiale ifølge vaskemærket: ${k.materialer}`,
    k.egenskaber && `Står på mærkerne: ${k.egenskaber}`,
    (k.laengde || k.skulderbredde) && `Plaggets mål: ${[k.laengde && `længde ${k.laengde} cm`, k.skulderbredde && `skulderbredde ${k.skulderbredde} cm`].filter(Boolean).join(", ")}${k.plagMaalKilde ? ` (${k.plagMaalKilde})` : ""}`,
    k.fejl && `Fejl set ved billedanalysen: ${k.fejl}`,
  ].filter(Boolean);
  return linjer.length ? "Fakta:\n" + linjer.join("\n") : "Fakta: ingen nypris eller mål slået op.";
}

const OPSLAG_TOOL = {
  name: "angiv_fund",
  description: "Angiv hvad opslaget fandt. Kald den til sidst, også når intet blev fundet.",
  input_schema: {
    type: "object",
    properties: {
      nypris: {
        type: ["integer", "null"],
        description: "Nyprisen i hele danske kroner, fundet hos mærket eller en dansk forhandler. null hvis den ikke blev fundet.",
      },
      nyprisKilde: { type: ["string", "null"], description: "Butikkens navn, højst fire ord, fx \"Magasin\" eller \"mærkets webshop\"." },
      maal: {
        type: ["string", "null"],
        description:
          "Mærkets egne mål for netop denne størrelse, kort og på dansk, fx \"brystvidde 88-92 cm, " +
          "længde 66 cm\". Ingen kildeangivelse, adresser eller ord på andre sprog. " +
          "null hvis mærkets størrelsesguide ikke blev fundet.",
      },
    },
      laengde: {
        type: ["integer", "null"],
        description:
          "Plaggets EGEN længde i cm i netop denne størrelse (fra skulder/linning til bund), som den står " +
          "på varens produktside eller i mærkets mål for selve plagget. Ikke kropsmål. null hvis den ikke står der.",
      },
      skulderbredde: {
        type: ["integer", "null"],
        description: "Plaggets skulderbredde i cm i netop denne størrelse, som den står hos mærket. Ikke kropsmål. null ellers.",
      },
    },
    required: ["nypris", "nyprisKilde", "maal", "laengde", "skulderbredde"],
  },
};

// Nyprisen og maalene slaas op paa nettet - en model, der svarer efter
// hukommelsen, finder paa et rundt tal. Opslaget er en ekstra: fejler det,
// skrives annoncen bare uden, og analysen maa aldrig vaelte paa det.
export async function slaaOp(
  apiKey: string,
  vare: {
    brand?: string | null; productType?: string; size?: string | null; color?: string; ny: boolean;
    maerker?: string | null;
  },
): Promise<{ nypris?: number; nyprisKilde?: string; maal?: string; laengde?: number; skulderbredde?: number }> {
  const brand = String(vare.brand ?? "").trim();
  const maerker = String(vare.maerker ?? "").trim();
  if (!brand && !maerker) return {};
  const spoerg = [
    vare.ny && "nyprisen i danske kroner (hos mærket selv eller en dansk forhandler; findes den ikke i Danmark, så omregn en europæisk pris og sig det i kilden)",
    vare.size && `mærkets størrelsesguide: hvilke mål størrelse ${vare.size} svarer til, og — kun hvis ` +
      "varens produktside eller mærket opgiver det — plaggets egen længde og skulderbredde i cm i den størrelse",
  ].filter(Boolean);
  if (!spoerg.length) return {};

  const messages: unknown[] = [{
    role: "user",
    content:
      `Vare: ${brand} ${vare.productType ?? ""}${vare.color ? `, ${vare.color}` : ""}` +
      `${vare.size ? `, str. ${vare.size}` : ""}.\n` +
      // Varenummer og stregkode rammer den praecise vare. Uden dem fandt
      // opslaget en strikket Teeshoppen-skjorte til 500 kr i stedet for
      // hoerskjorten til 349 kr; med dem fandt det den paa 10 s (2. oktober).
      (maerker ? `På mærkerne står: ${maerker}. Brug varenummer, modelnavn og stregkode i søgningen.\n` : "") +
      `Find ${spoerg.join(", og ")}. Søg højst et par gange, og kald så angiv_fund. ` +
      "Er du ikke sikker på, at det er den samme vare eller det samme mærkes guide, så skriv null.",
  }];

  // web_search er et servervaerktoej: soegningen sker hos Anthropic, og svaret
  // kommer tilbage i samme kald. Et langt opslag kan standse med pause_turn og
  // skal saa bare sendes videre. Den simple variant, ikke 20260209: den nye
  // filtrerer resultaterne med kode og tog 34-140 s mod 21 s for det samme
  // fund (maalt paa en Name It-softshell, 1. oktober). max_tokens 2000 slap op
  // undervejs og gav et tomt svar.
  for (let runde = 0; runde < 3; runde++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "DK" } },
          OPSLAG_TOOL,
        ],
        messages,
      }),
    });
    if (!res.ok) throw new Error(`opslag_${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const fund = (data?.content || []).find((b: { type?: string; name?: string }) =>
      b?.type === "tool_use" && b?.name === OPSLAG_TOOL.name);
    if (fund?.input) {
      const i = fund.input as Record<string, unknown>;
      const nypris = Math.round(Number(i.nypris));
      return {
        nypris: vare.ny && nypris > 0 ? nypris : undefined,
        nyprisKilde: vare.ny && nypris > 0 && i.nyprisKilde ? String(i.nyprisKilde) : undefined,
        // Kun naar der er spurgt om maal. Ellers lagde modellen produktnavnet
        // i feltet ("Hoerskjorte - Army, varenummer TEE35").
        maal: vare.size && i.maal ? String(i.maal) : undefined,
        laengde: vare.size ? cm(i.laengde) : undefined,
        skulderbredde: vare.size ? cm(i.skulderbredde) : undefined,
      };
    }
    if (data?.stop_reason !== "pause_turn") return {};
    messages.push({ role: "assistant", content: data.content });
  }
  return {};
}

// Et maal i hele cm, eller intet. Et plag under 10 eller over 250 cm er en
// fejllaesning, ikke et maal.
export function cm(v: unknown): number | undefined {
  const n = Math.round(Number(String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "")));
  return n >= 10 && n <= 250 ? n : undefined;
}
