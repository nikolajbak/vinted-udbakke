// node --test tools/test-valg.mjs
// Står det, appen ville have, i annoncen (_shared/valg.ts)? Parrene er
// udkastets og garderobens værdier, målt 2. november.
import test from "node:test";
import assert from "node:assert/strict";
import { passerUde, sammeFlere, sammeStoerrelse } from "../supabase/functions/_shared/valg.ts";

test("størrelsen: samme på Vinteds måde at skrive den", () => {
  for (const [a, b] of [["M", "M / 38 / 10"], ["110", "5 år / 110 cm"], ["30", "EU 46 | W30"],
    ["34/32", "EU 50 | W34"], ["41-42", "42"], ["4", "4 år / 104 cm"], ["XS", "XS"],
    ["XL", "XL / 42 / 14"], ["37.5", "37,5"]]) {
    assert.ok(sammeStoerrelse(a, b), a + " | " + b);
  }
});

test("størrelsen: en anden størrelse er ikke den samme", () => {
  for (const [a, b] of [["S", "XXXS / 30 / 2"], ["122", "XXXS / 30 / 2"], ["W30 L34", "M / 38 / 10"],
    ["UK 7½ / EU 41½", "37,5"], ["52", "2-3 år, 51 cm"], ["M", "S / 36 / 8"]]) {
    assert.ok(!sammeStoerrelse(a, b), a + " | " + b);
  }
});

test("farver i vilkårlig rækkefølge", () => {
  assert.ok(sammeFlere("Lyserød, Blå", "blå,lyserød"));
  assert.ok(!sammeFlere("Lyserød, Blå", "Blå"));
});

test("passerUde pr. felt", () => {
  assert.ok(passerUde("price", "45", 45));
  assert.ok(passerUde("category", "Midikjoler", ["Kvinder", "Tøj", "Kjoler", "Midikjoler"]));
  assert.ok(!passerUde("category", "Kjoler", ["Kvinder", "Tøj", "Kjoler", "Midikjoler"]));
  assert.ok(passerUde("size", "12 år / 152 cm", "152"));
  assert.ok(passerUde("condition", "Meget god", "meget god"));
  assert.ok(!passerUde("condition", "God", "Meget god"));
  assert.ok(!passerUde("brand", null, "adidas"));
  assert.ok(passerUde("color", "Sort", "Sort"));
});
