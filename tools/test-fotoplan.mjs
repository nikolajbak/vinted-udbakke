// node --test tools/test-fotoplan.mjs
// Billeder lagt til og fjernet i appen, sendt til Vinted (fotoplan.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { fotoPlan, fuldtSat, medNye, glemFjernede } from "../supabase/functions/vinted-fill-script/fotoplan.ts";

const KORT = [{ id: "100001", rod: "a" }, { id: "100002", rod: "b" }, { id: "100003", rod: "c" }];
const URL = (r) => "https://x/" + r + ".jpg";

test("kun raekkefoelge: id'erne i ny orden, intet nyt, intet fjernet", () => {
  assert.deepEqual(fotoPlan(KORT, ["c", "a", "b"], ["100001", "100002", "100003"], URL),
    { oenske: ["100003", "100001", "100002"], fjern: [], nye: [], uden: [] });
});

test("et nyt billede laegges op paa sin plads", () => {
  assert.deepEqual(fotoPlan(KORT, ["a", "n", "b", "c"], ["100001", "100002", "100003"], URL),
    { oenske: ["100001", { ny: "n", url: "https://x/n.jpg" }, "100002", "100003"], fjern: [], nye: ["n"], uden: [] });
});

test("et fjernet billede kommer i fjern", () => {
  assert.deepEqual(fotoPlan(KORT, ["a", "c"], ["100001", "100002", "100003"], URL),
    { oenske: ["100001", "100003"], fjern: ["100002"], nye: [], uden: [] });
});

test("slettet paa Vinted laegges ikke op igen; ukendt paa Vinted roeres ikke", () => {
  assert.deepEqual(fotoPlan(KORT, ["a", "b", "c"], ["100001", "100003", "999999"], URL),
    { oenske: ["100001", "100003"], fjern: [], nye: [], uden: [] });
});

test("uden adresse kan et nyt billede ikke laegges op", () => {
  const p = fotoPlan(KORT, ["a", "n"], ["100001"], () => null);
  assert.deepEqual([p.nye, p.uden], [[], ["n"]]);
});

test("fuldtSat: samme liste og raekkefoelge", () => {
  assert.equal(fuldtSat(KORT, ["a", "b", "c"], ["100001", "100002", "100003"]), true);
  assert.equal(fuldtSat(KORT, ["b", "a", "c"], ["100001", "100002", "100003"]), false);
});

test("fuldtSat: et fjernet billede staar der stadig", () => {
  assert.equal(fuldtSat(KORT, ["a", "c"], ["100001", "100002", "100003"]), false);
  assert.equal(fuldtSat(KORT, ["a", "c"], ["100001", "100003"]), true);
});

test("fuldtSat: et nyt billede er ikke parret endnu", () => {
  assert.equal(fuldtSat(KORT, ["a", "b", "c", "n"], ["100001", "100002", "100003", "100009"]), false);
  const k = medNye(KORT, [{ rod: "n", id: "100009" }], ["100001", "100002", "100003", "100009"]);
  assert.equal(fuldtSat(k, ["a", "b", "c", "n"], ["100001", "100002", "100003", "100009"]), true);
});

test("fuldtSat: dit eget billede paa Vinted og et slettet taeller ikke", () => {
  assert.equal(fuldtSat(KORT, ["a", "b", "c"], ["100001", "999999", "100003"]), true);
});

test("medNye: kun id'er paa Vinted, ingen dubletter", () => {
  const k = medNye(KORT, [
    { rod: "n", id: "100009" }, { rod: "m", id: "100001" }, { rod: "a", id: "100010" },
    { rod: "o", id: "100011" }, { rod: "p", id: "abc" }, null,
  ], ["100001", "100009", "100010"]);
  assert.deepEqual(k.slice(3), [{ id: "100009", rod: "n" }]);
});

test("glemFjernede: fjernet begge steder glemmes, slettet kun paa Vinted huskes", () => {
  // b er fjernet i appen og paa Vinted; c er kun slettet paa Vinted.
  assert.deepEqual(glemFjernede(KORT, ["a", "c"], ["100001"]), [{ id: "100001", rod: "a" }, { id: "100003", rod: "c" }]);
  // Lagt tilbage i appen bagefter: b er ikke kendt, saa den laegges op igen.
  const k = glemFjernede(KORT, ["a", "c"], ["100001"]);
  assert.deepEqual(fotoPlan(k, ["a", "b", "c"], ["100001"], URL).nye, ["b"]);
});
