// node --test tools/test-annoncering.mjs
// Betalt annoncering: fakturaen, tragten og dommen (_shared/annoncering.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { laesFaktura, tragt, boostDom, boostSalg, boostLinje } from "../supabase/functions/_shared/annoncering.ts";

// Mail 44, 19. oktober.
const EMNE = "Boost af din artikel - din faktura";
const TEKST = "E-mails fra Vinted\n Hej nikolajnbak\n Dit boost er live 2 Artikler.\n" +
  " Din(e) boostede artikel/artikler får et skub højere op i resultaterne i 3 dage.\n" +
  " 3-dags lokalt Boost (2 Artikler) \n 28.20 kr. \n Discount \n -2.82 kr. \n I alt \n 25.38 kr. \n Apple Pay \n Vinted-teamet";

const NR7 = { impressions: 2397, views: 54, favorites: 6, conversations: 0, forskel: 3.84 };

test("fakturaen fra mail 44", () => {
  const f = laesFaktura(EMNE, TEKST);
  assert.equal(f.slags, "boost");
  assert.equal(f.dage, 3);
  assert.equal(f.antal, 2);
  assert.equal(f.kr, 25.38);
  assert.match(f.tekst, /3-dags lokalt Boost/);
});

test("andre mails er ikke en faktura", () => {
  assert.equal(laesFaktura("Du har solgt en artikel på Vinted", "Anna har købt\nJakke\n80.00 kr."), null);
});

test("beløb med tusindtal og komma", () => {
  assert.equal(laesFaktura(EMNE, "7-dags Boost (12 Artikler)\nI alt\n1.234,50 kr.").kr, 1234.5);
});

test("tragten", () => {
  const t = tragt(NR7);
  assert.equal(t.vist, 2397);
  assert.equal(t.klik, 54);
  assert.equal(t.klikPct, 2.3);
  assert.equal(t.hjerter, 6);
  assert.equal(t.hjertePct, 11.1);
  assert.equal(t.beskeder, 0);
});

test("ingen tal, ingen tragt", () => {
  assert.equal(tragt(null), null);
  assert.equal(tragt({ impressions: 0, views: 0, favorites: 0, conversations: 0 }), null);
});

const NU = new Date("2026-10-20T12:00:00Z");
const SLUT_FREMME = "2026-10-22T03:53:00Z";
const SLUT_FORBI = "2026-10-19T03:53:00Z";

test("solgt: boostet betalte sig", () => {
  assert.match(boostDom(NR7, [], { solgtFor: 450, slut: SLUT_FREMME, nu: NU }), /^Boostet betalte sig: solgt for 450,00 kr/);
});

test("få klik", () => {
  const d = boostDom({ impressions: 2000, views: 18, favorites: 2, conversations: 0 }, [], { slut: SLUT_FREMME, nu: NU });
  assert.match(d, /^Få klik/);
  assert.match(d, /skøn/);
});

test("klik, men få hjerter", () => {
  assert.match(boostDom({ impressions: 2397, views: 54, favorites: 1, conversations: 0 }, [], { slut: SLUT_FREMME, nu: NU }),
    /^Klik, men få hjerter/);
});

test("mange hjerter, intet salg efter boostet", () => {
  assert.match(boostDom(NR7, [], { slut: SLUT_FORBI, nu: NU }), /^Mange hjerter, intet salg/);
});

test("mange hjerter, mens boostet stadig kører, er på niveau", () => {
  assert.match(boostDom(NR7, [], { slut: SLUT_FREMME, nu: NU }), /^Klikrate 2,3 % og hjerterate 11,1 %/);
});

test("mod fem andre boostede varer", () => {
  const andre = Array.from({ length: 5 }, () => ({ impressions: 1000, views: 50, favorites: 5, conversations: 0 }));
  const d = boostDom({ impressions: 1000, views: 30, favorites: 3, conversations: 0 }, andre, { slut: SLUT_FREMME, nu: NU });
  assert.match(d, /^Få klik/);
  assert.doesNotMatch(d, /skøn/);
});

test("ingen tal, ingen dom (men et salg siges stadig)", () => {
  assert.equal(boostDom(null, [], { slut: SLUT_FREMME, nu: NU }), null);
  assert.match(boostDom(null, [], { solgtFor: 100, slut: SLUT_FREMME, nu: NU }), /^Boostet betalte sig/);
});

test("boost-salg: under boostet og op til 7 dage efter", () => {
  const r = { start: "2026-10-19T03:53:00Z", slut: "2026-10-22T03:53:00Z" };
  assert.equal(boostSalg(r, "2026-10-20T10:00:00Z"), true);
  assert.equal(boostSalg(r, "2026-10-28T03:00:00Z"), true);
  assert.equal(boostSalg(r, "2026-10-30T04:00:00Z"), false);
  assert.equal(boostSalg(r, "2026-10-18T10:00:00Z"), false);
  assert.equal(boostSalg(r, null), false);
});

test("linjen til prompterne", () => {
  const r = { start: "2026-10-19T03:53:00Z", slut: "2026-10-22T03:53:00Z", kr: 12.69, tal: NR7 };
  assert.equal(boostLinje(r, "2026-10-20T10:00:00Z"),
    "boostet 3 d for 12,69 kr fra 19.10 (2.397 vist, 54 klik, 6 hjerter), solgt under/efter boostet");
  assert.equal(boostLinje({ ...r, kr: null, tal: null }, null), "boostet 3 d (beløb ukendt) fra 19.10");
});

// Fundet ved gennemgangen af task 1.
test("én vare: »(1 Artikel)«", () => {
  const f = laesFaktura(EMNE, "1-dags lokalt Boost (1 Artikel)\nI alt\n10.00 kr.");
  assert.equal(f.antal, 1);
  assert.equal(f.kr, 10);
  assert.equal(f.tekst, "1-dags lokalt Boost (1 Artikel)");
});

test("»I alt« er linjen, ikke en moms-linje foran", () => {
  assert.equal(laesFaktura(EMNE, "3-dags Boost (2 Artikler)\nMoms i alt 5.08 kr.\nI alt: 25.38 kr.").kr, 25.38);
});

test("solgt uden kendt salgspris er stadig solgt", () => {
  assert.equal(boostDom(NR7, [], { solgt: true, slut: SLUT_FORBI, nu: NU }), "Boostet betalte sig: solgt.");
});

test("graensen sammenlignes uafrundet: 1,46 % er under 1,5 %", () => {
  assert.match(boostDom({ impressions: 10000, views: 146, favorites: 20, conversations: 0 }, [], { slut: SLUT_FREMME, nu: NU }),
    /^Få klik/);
});
