// node --test tools/test-forsendelse.mjs
// Forsendelsen laest af Vinteds mails (_shared/forsendelse.ts). Teksterne er
// afskrevet af vinted_mails 10, 11, 15, 25, 27, 28, 48 og 49.
import test from "node:test";
import assert from "node:assert/strict";
import { erForsendelse, laesForsendelse, fletForsendelse, kbhTilIso, vaelgMaerkat } from "../supabase/functions/_shared/forsendelse.ts";

const GLS_EMNE = "Jack & Jones Chris jeans str. 164 (14 år) sort fragtmærkat – skal anvendes inden d. 26.10.2026 kl. 15.09";
const GLS = "E-mails fra Vinted\r\n Hej nikolajnbak, \n Din fragtmærkat er vedhæftet denne meddelelse.\n fragtoplysninger \n" +
  " Artikelnavn: \r\n Jack & Jones Chris jeans str. 164 (14 år) sort\n Pakkestørrelse: \r\n Under 1000.0 g \r\n" +
  " Sporingskode: \r\n YPCECWZ9 \r\n Deadline for forsendelse: \r\n d. 26.10.2026 kl. 15.09 \r\n Transaktions-id: \r\n 23357666369 \r\n" +
  " Tjek åbningstiderne på det nærmeste GLS afleveringssted . Du kan aflevere pakke hos pakkeshop.\n" +
  " Vis det digitale mærkat på din telefon \nPersonalet ved afleveringsstedet scanner koden";

const DAO_EMNE = "Sofie Schnoor strik str. S brun leopard oversize Fragtkode: BRUGES INDEN D. d. 16.10.2026 kl. 10.00";
const DAO = "Hej nikolajnbak\n Din fragtkode er angivet i denne besked. \n Fragtoplysninger \n Artikel: \r\n Sofie Schnoor strik\n" +
  " Pakkens størrelse: \r\n Under 1000.0 g \r\n Sporingskode: \n 00057151273830288437 \r\n Frist for afsendelse:\n" +
  " d. 16.10.2026 kl. 10.00 \r\n Transaktions-id: \r\n 23005580734 \r\n Din fragtkode er 120002328 \n" +
  " Tjek åbningstiderne på det nærmeste dao afleveringssted . Oplys koden til personalet ved afleveringsstedet";

const OPD = "Ordreopdatering til Mads Nørgaard tørklæde, stribet ribstrik, Thea Scarf";

test("kun forsendelsens emner — ikke salgsmailen", () => {
  assert.ok(erForsendelse(GLS_EMNE));
  assert.ok(erForsendelse(DAO_EMNE));
  assert.ok(erForsendelse(OPD));
  assert.ok(erForsendelse("Denne ordre er fuldført"));
  assert.ok(!erForsendelse("Du har solgt en artikel på Vinted"));
  assert.equal(laesForsendelse("Du har solgt en artikel på Vinted", "generere din fragtmærkat"), null);
});

test("GLS-maerkatet fra mail 48", () => {
  const f = laesForsendelse(GLS_EMNE, GLS);
  assert.equal(f.status, "klar");
  assert.equal(f.sporingskode, "YPCECWZ9");
  assert.equal(f.transaktion, "23357666369");
  assert.equal(f.pakke, "Under 1000 g");
  assert.equal(f.transportoer, "GLS");
  assert.equal(f.digital, true);
  assert.equal(f.fragtkode, undefined);
  // 26. oktober er efter sommertiden: kl. 15.09 dansk = 14.09 UTC.
  assert.equal(f.frist, "2026-10-26T14:09:00.000Z");
});

test("DAO-fragtkoden fra mail 10", () => {
  const f = laesForsendelse(DAO_EMNE, DAO);
  assert.equal(f.status, "klar");
  assert.equal(f.fragtkode, "120002328");
  assert.equal(f.sporingskode, "00057151273830288437");
  assert.equal(f.transportoer, "DAO");
  assert.equal(f.transaktion, "23005580734");
  // 16. oktober er sommertid: kl. 10.00 dansk = 08.00 UTC.
  assert.equal(f.frist, "2026-10-16T08:00:00.000Z");
});

test("ordreopdateringerne", () => {
  const paaVej = laesForsendelse(OPD, "Hej,\n Din pakke er på vej til køberen! Anslået levering er Okt 19 - Okt 21 for Mads Nørgaard tørklæde.\n Gå til samtale");
  assert.equal(paaVej.status, "paa_vej");
  assert.equal(paaVej.levering, "19.–21. okt.");
  assert.equal(laesForsendelse(OPD, "Hej,\n Vi venter på, at opatija123 henter sin ordre.").status, "afhentes");
  assert.equal(laesForsendelse(OPD, "opatija123 har modtaget sin ordre.\n Du modtager automatisk betaling").status, "modtaget");
  assert.equal(laesForsendelse(OPD, "Det er tid til at sende din artikel! Hent den forudbetalte mærkat, og send din pakke.").status, "mangler");
  assert.equal(laesForsendelse(OPD, "Det er tid til at sende! Sæt mærkaten på din pakke").status, undefined);
  assert.equal(laesForsendelse(OPD, "csalg2025 accepterede anmodning om forlængelse af leveringsfristen").status, undefined);
  assert.equal(laesForsendelse("Denne ordre er fuldført", "dit salg er gennemført").status, "fuldfoert");
});

test("status gaar kun frem, og felterne bliver staaende", () => {
  let f = fletForsendelse(null, { status: "mangler", tekst: "Solgt", samtale: "https://www.vinted.dk/inbox/1" }, "2026-10-17T19:17:00Z", 39);
  f = fletForsendelse(f, laesForsendelse(GLS_EMNE, GLS), "2026-10-18T14:46:00Z", 41);
  f = fletForsendelse(f, laesForsendelse(OPD, "Din pakke er på vej til køberen! Anslået levering er Okt 19 - Okt 21 for x."), "2026-10-18T16:19:00Z", 42);
  f = fletForsendelse(f, laesForsendelse(OPD, "Det er tid til at sende din artikel! Hent den forudbetalte mærkat"), "2026-10-18T17:00:00Z", 43);
  assert.equal(f.status, "paa_vej");
  assert.equal(f.samtale, "https://www.vinted.dk/inbox/1");
  assert.equal(f.sporingskode, "YPCECWZ9");
  assert.equal(f.haendelser.length, 4);
  // Samme mail igen er én haendelse.
  f = fletForsendelse(f, laesForsendelse(GLS_EMNE, GLS), "2026-10-18T14:46:00Z", 41);
  assert.equal(f.haendelser.length, 4);
});

test("en mail, du selv sender videre", () => {
  assert.ok(erForsendelse("Fwd: " + GLS_EMNE));
  assert.ok(erForsendelse("VS: " + OPD));
  const citeret = GLS.split("\n").map((l) => "> " + l).join("\n");
  const f = laesForsendelse("Fwd: " + GLS_EMNE, citeret);
  assert.equal(f.status, "klar");
  assert.equal(f.sporingskode, "YPCECWZ9");
  assert.equal(f.frist, "2026-10-26T14:09:00.000Z");
  assert.equal(laesForsendelse("Fwd: " + OPD, "> Din pakke er på vej til køberen! Anslået levering er Okt 19 - Okt 21 for x.").status, "paa_vej");
});

test("dansk tid omkring skiftet", () => {
  assert.equal(kbhTilIso(2026, 10, 24, 12, 0), "2026-10-24T10:00:00.000Z");
  assert.equal(kbhTilIso(2026, 10, 25, 12, 0), "2026-10-25T11:00:00.000Z");
  assert.equal(kbhTilIso(2026, 1, 5, 12, 0), "2026-01-05T11:00:00.000Z");
});

test("maerkatet blandt filerne", () => {
  const logo = { navn: "logo.png", type: "image/png", data: new Uint8Array(3000) };
  const pdf = { navn: "label.pdf", type: "application/pdf", data: new Uint8Array(50000) };
  const qr = { navn: "qr.png", type: "image/png", data: new Uint8Array(40000) };
  assert.equal(vaelgMaerkat([logo, pdf, qr]), pdf);
  assert.equal(vaelgMaerkat([logo, qr]), qr);
  assert.equal(vaelgMaerkat([logo]), null);
});

// vinted_mails 138 (9. november, nr. 84): koeberen annullerede fire minutter
// efter salget.
const ANNUL = "E-mails fra Vinted\r\n Hej,\n Denne ordre er annulleret. Køberen vil modtage en refundering.\n Gå til samtale \n";

test("annulleret: købet er væk, og status kan ikke gå tilbage", () => {
  const f = laesForsendelse("Ordreopdatering til The North Face Simple Dome t-shirt str. 146, sort", ANNUL);
  assert.equal(f.status, "annulleret");
  let g = fletForsendelse(null, { status: "mangler", tekst: "Solgt" }, "2026-11-09T13:33:45Z", 137);
  g = fletForsendelse(g, f, "2026-11-09T13:38:07Z", 138);
  assert.equal(g.status, "annulleret");
  g = fletForsendelse(g, { tekst: "Vinted minder dig om at sende" }, "2026-11-09T14:00:00Z", 139);
  assert.equal(g.status, "annulleret");
});

test("fragtmærkatets »ellers annulleres transaktionen« er ikke en annullering", () => {
  assert.notEqual(laesForsendelse(OPD, "Send inden fristen, ellers annulleres transaktionen.").status, "annulleret");
  assert.notEqual(laesForsendelse(GLS_EMNE, GLS + " ellers annulleres transaktionen").status, "annulleret");
});

test("solgt igen efter en annullering starter forfra med historikken", () => {
  let g = fletForsendelse(null, { status: "klar", tekst: "Fragtmærkat klar", sporingskode: "GAMMEL", frist: "2026-11-14T00:00:00Z" }, "2026-11-09T13:00:00Z", 1);
  g = fletForsendelse(g, { status: "annulleret", tekst: "Annulleret" }, "2026-11-09T14:00:00Z", 2);
  g = fletForsendelse(g, { status: "mangler", tekst: "Solgt", frist: "2026-11-20T00:00:00Z" }, "2026-11-15T10:00:00Z", 3);
  assert.equal(g.status, "mangler");
  assert.equal(g.sporingskode, undefined);
  assert.equal(g.frist, "2026-11-20T00:00:00Z");
  assert.equal(g.haendelser.length, 3);
});
