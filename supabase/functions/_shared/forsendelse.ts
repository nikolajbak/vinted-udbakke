// Forsendelsen af en solgt vare, laest af Vinteds mails (bestemt af dig
// 19. oktober: ved salg hentes fragtmaerkatet og det andet, forsendelsen
// kraever, ind paa varen i appen). Rene funktioner uden imports, saa de kan
// proeves med node --test (tools/test-forsendelse.mjs).
//
// Moenstrene er maalt paa rigtige mails (vinted_mails 10-49, 9.-19. oktober):
//   »<titel> fragtmærkat – skal anvendes inden d. 26.10.2026 kl. 10.00« (GLS)
//   »<titel> Fragtkode: BRUGES INDEN D. d. 16.10.2026 kl. 10.00« (DAO)
//   »Ordreopdatering til <titel>« - paa vej, afhentes, modtaget, send nu
//   »Denne ordre er fuldført«

export type Status = "mangler" | "klar" | "paa_vej" | "afhentes" | "modtaget" | "fuldfoert";

export type Forsendelse = {
  status: Status;
  transportoer?: string;
  sporingskode?: string;
  fragtkode?: string;
  frist?: string; // ISO
  pakke?: string;
  transaktion?: string;
  samtale?: string;
  levering?: string;
  digital?: boolean;
  maerkat?: string; // sti i Storage-mappen »maerkater«
  maerkat_type?: string;
  opdateret?: string;
  haendelser?: { at: string; tekst: string; mail?: number }[];
};

export type Laest = Partial<Forsendelse> & { tekst: string };

// Raekkefoelgen: en senere mail kan ikke saette status tilbage (en paamindelse
// om at sende, efter pakken er afleveret, er ikke en ny tilstand).
export const RANG: Record<Status, number> = {
  mangler: 0, klar: 1, paa_vej: 2, afhentes: 3, modtaget: 4, fuldfoert: 5,
};

// Er mailen om forsendelsen? Kun paa emnet: salgsmailen naevner ogsaa
// »fragtmærkat« i teksten.
export function erForsendelse(emne: string): boolean {
  return /^\s*ordreopdatering til |fragtmærkat|fragtkode:|denne ordre er fuldført/i.test(emne);
}

// Dansk tid → ISO. Sommertid fra sidste soendag i marts kl. 2 til sidste
// soendag i oktober kl. 3 (oktober 2026: 25.).
function sidsteSoendag(aar: number, md: number): number {
  const d = new Date(Date.UTC(aar, md, 0));
  return d.getUTCDate() - d.getUTCDay();
}
export function kbhTilIso(aar: number, md: number, dag: number, t: number, min: number): string {
  const s = Date.UTC(aar, 2, sidsteSoendag(aar, 3), 1);
  const v = Date.UTC(aar, 9, sidsteSoendag(aar, 10), 1);
  const somAntaget = Date.UTC(aar, md - 1, dag, t - 1, min);
  const sommer = somAntaget >= s && somAntaget < v;
  return new Date(Date.UTC(aar, md - 1, dag, t - (sommer ? 2 : 1), min)).toISOString();
}

function frist(tekst: string): string | undefined {
  const m = tekst.match(/(?:deadline for forsendelse|frist for afsendelse)\s*:\s*d\.\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*kl\.\s*(\d{1,2})[.:](\d{2})/i);
  return m ? kbhTilIso(+m[3], +m[2], +m[1], +m[4], +m[5]) : undefined;
}

function efter(tekst: string, navn: string): string | undefined {
  const m = tekst.match(new RegExp(navn + "\\s*:\\s*#?([^\\s]+)", "i"));
  return m ? m[1] : undefined;
}

// »Okt 19 - Okt 21« → »19.–21. okt.«; »Okt 30 - Nov 2« → »30. okt.–2. nov.«
function levering(s: string): string {
  const m = s.match(/([a-zæøå]{3})\w*\s+(\d{1,2})\s*-\s*([a-zæøå]{3})\w*\s+(\d{1,2})/i);
  if (!m) return s.trim();
  const a = m[1].toLowerCase(), b = m[3].toLowerCase();
  return a === b ? `${m[2]}.–${m[4]}. ${a}.` : `${m[2]}. ${a}.–${m[4]}. ${b}.`;
}

// Hvad mailen siger om forsendelsen. null, hvis den ikke handler om den.
export function laesForsendelse(emne: string, raa: string): Laest | null {
  if (!erForsendelse(emne)) return null;
  const tekst = raa.replace(/\r/g, "");
  if (/fragtmærkat|fragtkode:/i.test(emne)) {
    const ud: Laest = { status: "klar", tekst: "Fragtmærkat klar" };
    const spor = efter(tekst, "Sporingskode");
    if (spor) ud.sporingskode = spor;
    const tr = efter(tekst, "Transaktions-id");
    if (tr && /^\d+$/.test(tr)) ud.transaktion = tr;
    const p = tekst.match(/(?:pakkestørrelse|pakkens størrelse)\s*:\s*(under\s+[\d.,]+\s*k?g)/i);
    if (p) ud.pakke = p[1].replace(/(\d)\.0\b/, "$1").replace(/^u/, "U");
    const f = frist(tekst);
    if (f) ud.frist = f;
    const k = tekst.match(/din fragtkode er\s+(\d{4,})/i);
    if (k) ud.fragtkode = k[1];
    const t = tekst.match(/nærmeste\s+(\S+)\s+afleveringssted/i);
    if (t) ud.transportoer = t[1].length <= 4 ? t[1].toUpperCase() : t[1];
    if (/digitale mærkat/i.test(tekst)) ud.digital = true;
    ud.tekst = "Fragtmærkat klar" + (ud.transportoer ? " (" + ud.transportoer + ")" : "");
    return ud;
  }
  if (/denne ordre er fuldført/i.test(emne) || /salg er gennemført/i.test(tekst)) {
    return { status: "fuldfoert", tekst: "Handlen er gennemført" };
  }
  const lev = tekst.match(/anslået levering er\s+([^\n]+?)\s+for\s/i);
  if (/din pakke er på vej/i.test(tekst)) {
    const ud: Laest = { status: "paa_vej", tekst: "Pakken er på vej" };
    if (lev) { ud.levering = levering(lev[1]); ud.tekst += ", levering " + ud.levering; }
    return ud;
  }
  if (/venter på, at .+ henter/i.test(tekst)) return { status: "afhentes", tekst: "Venter på, at køberen henter den" };
  if (/har modtaget sin ordre/i.test(tekst)) return { status: "modtaget", tekst: "Køberen har modtaget den" };
  if (/forlængelse af leveringsfristen/i.test(tekst)) return { tekst: "Køberen har forlænget fristen" };
  if (/hent den forudbetalte mærkat/i.test(tekst)) return { status: "mangler", tekst: "Vinted beder dig hente mærkatet" };
  if (/sæt mærkaten på din pakke|tid til at sende/i.test(tekst)) return { tekst: "Vinted minder dig om at sende" };
  return { tekst: "Ordreopdatering" };
}

// Laeg en ny mails oplysninger oven i det, annoncen ved. Status gaar kun
// frem; et felt, mailen ikke naevner, bliver staaende. Samme mail to gange
// (?genlaes) er én haendelse.
export function fletForsendelse(gammel: Forsendelse | null, ny: Laest, at: string, mail?: number): Forsendelse {
  const g: Forsendelse = gammel ? { ...gammel } : { status: "mangler" };
  const { tekst, status, haendelser: _h, ...felter } = ny;
  for (const [k, v] of Object.entries(felter)) {
    if (v !== undefined && v !== null && v !== "") (g as Record<string, unknown>)[k] = v;
  }
  if (status && RANG[status] >= RANG[g.status]) g.status = status;
  const h = (g.haendelser ?? []).filter((x) => mail === undefined || x.mail !== mail);
  h.push({ at, tekst, ...(mail !== undefined ? { mail } : {}) });
  h.sort((a, b) => a.at.localeCompare(b.at));
  g.haendelser = h.slice(-20);
  g.opdateret = at;
  return g;
}

// Det vedhaeftede maerkat blandt mailens filer: en PDF foerst, ellers det
// stoerste billede over 10 kB (Vinteds logoer er smaa, indlejrede billeder).
export type Fil = { navn: string; type: string; data: Uint8Array };
export function vaelgMaerkat(filer: Fil[]): Fil | null {
  const pdf = filer.find((f) => /pdf/i.test(f.type) || /\.pdf$/i.test(f.navn));
  if (pdf) return pdf;
  const bil = filer.filter((f) => /^image\/(png|jpe?g|gif)/i.test(f.type) && f.data.length > 10000)
    .sort((a, b) => b.data.length - a.data.length);
  return bil[0] ?? null;
}
