// node --test tools/test-prisvagt.mjs
// Prisvagten og NYE varer (beslutPris i vinted-fill-script/prisvagt.ts). Bestemt af dig 5. november:
// en ny vare til 800 kr i butikken sættes ikke til 70 kr, fordi det er medianen for brugte jakker.
import test from "node:test";
import assert from "node:assert/strict";
import { beslutPris } from "../supabase/functions/vinted-fill-script/prisvagt.ts";

const RAMME = { nypris: 800, gulv: 320, loft: 600 };
const vagt = (x = {}) => ({
  id: "1", title: "Regnjakke", platform: "vinted", price: 400, start_price: 450, floor_price: null,
  listed_at: "2026-10-01T00:00:00Z", last_change_at: "2026-10-01T00:00:00Z", checks: 3,
  favourites: 0, favourites_prev: 0, historik: [], ...x,
});
const brugte = Array.from({ length: 20 }, (_, i) => ({ price: 60 + i, condition: "God", title: "brugt " + i }));
const nye = [{ price: 350, condition: "Ny med prismærker" }, { price: 400, condition: "Ny uden prismærker" }, { price: 500, condition: "Ny med prismærker" }];

async function koer(v, comparables, svar) {
  let prompt = "";
  const b = await beslutPris(v, { id: "1", price: v.price, comparables }, async (_s, t) => {
    prompt = t;
    return { naesteTjekDage: 7, begrundelse: "x", ...svar };
  });
  return { b, prompt };
}

test("ny vare med nypris: sættes ikke under 40 % af nyprisen, selvom modellen vil til 70 kr", async () => {
  const { b } = await koer(vagt({ ny: true, ramme: RAMME, price: 350 }), brugte, { handling: "saenk", nyPris: 70 });
  assert.ok(b.handling !== "saenk" || b.nyPris >= 320, JSON.stringify(b));
});

test("ny vare over gulvet kan stadig sættes ned, men aldrig under gulvet", async () => {
  const { b } = await koer(vagt({ ny: true, ramme: RAMME, price: 500 }), nye, { handling: "saenk", nyPris: 300 });
  assert.equal(b.handling, "saenk");
  assert.ok(b.nyPris >= 320 && b.nyPris < 500, String(b.nyPris));
});

test("ny vare: kun nye annoncer tæller som felt, og brugte når ikke modellen", async () => {
  const { b, prompt } = await koer(vagt({ ny: true, ramme: RAMME }), [...brugte, ...nye], { handling: "behold", nyPris: 400 });
  assert.equal(b.sammenlignelige, 3);
  assert.equal(b.median, 400);
  assert.ok(!prompt.includes("brugt 3"), "brugte annoncer må ikke stå i prompten");
});

test("ny vare med under tre nye annoncer: intet felt, og det siges til modellen", async () => {
  const { b, prompt } = await koer(vagt({ ny: true, ramme: RAMME }), [...brugte, nye[0]], { handling: "behold", nyPris: 400 });
  assert.equal(b.median, null);
  assert.equal(b.sammenlignelige, 0);
  assert.match(prompt, /færre end tre nye/i);
});

test("prompten kender standen, nyprisen og gulvet", async () => {
  const { prompt } = await koer(vagt({ ny: true, ramme: RAMME }), nye, { handling: "behold", nyPris: 400 });
  assert.match(prompt, /ny og ubrugt/i);
  assert.match(prompt, /Nypris: 800 kr/);
  assert.match(prompt, /IKKE må underskrides: 320 kr/);
});

test("ny vare uden fundet nypris sættes ikke ned af vagten", async () => {
  const { b } = await koer(vagt({ ny: true, ramme: null, price: 300 }), brugte, { handling: "saenk", nyPris: 250 });
  assert.equal(b.handling, "behold");
  assert.equal(b.nyPris, 300);
  assert.match(b.begrundelse, /uden fundet nypris/);
});

test("ny vare, der allerede står under gulvet: holdes, ikke stoppet og ikke sat ned", async () => {
  for (const handling of ["saenk", "stop", "behold"]) {
    const { b } = await koer(vagt({ ny: true, ramme: RAMME, price: 220 }), brugte, { handling, nyPris: 180 });
    assert.equal(b.handling, "behold", handling);
    assert.equal(b.nyPris, 220);
    assert.match(b.begrundelse, /under/);
    assert.ok(b.naesteTjekDage >= 14);
  }
});

test("brugt vare: som før, hele feltet og bunden på 40 % af udbudsprisen", async () => {
  const { b } = await koer(vagt({ price: 400, start_price: 450 }), brugte, { handling: "saenk", nyPris: 350 });
  assert.equal(b.handling, "saenk");
  assert.equal(b.sammenlignelige, 20);
  assert.equal(b.nyPris, 350);
});
