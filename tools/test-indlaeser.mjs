// node --test tools/test-indlaeser.mjs
// Indlæseren i brugerscriptet (_shared/brugerscript.ts): 5. november kørte en
// enhed 2.0.1 med den lukkede nøgle. Den fik 401 på hver side og sagde intet.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { indlaeser } from "../supabase/functions/_shared/brugerscript.ts";

const B = { navn: "VintedAuto", beskrivelse: "", fil: "udbakke", base: "https://x.test/f", noegle: "k", match: [],
  apiVar: "__A__", autoVar: "__B__", verVar: "__C__" };

function koer(status, tekst = "") {
  const lagt = [];
  const el = () => ({ setAttribute() {}, addEventListener() {}, appendChild(c) { (this.boern ||= []).push(c); }, remove() {} });
  const ctx = {
    document: { body: { appendChild: (d) => lagt.push(d) }, createElement: el, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    location: {},
    koerte: 0,
    XMLHttpRequest: function () {
      this.open = () => {};
      this.send = () => { this.status = status; this.responseText = tekst; this.onload(); };
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(indlaeser(B, "2.0.9"), ctx);
  return { ctx, baand: lagt };
}

test("200: runneren køres, og der kommer intet bånd", () => {
  const { ctx, baand } = koer(200, "koerte=1");
  assert.equal(ctx.koerte, 1);
  assert.equal(baand.length, 0);
});

test("401: båndet viser, at scriptet skal installeres igen, og runneren køres ikke", () => {
  const { ctx, baand } = koer(401, "koerte=1");
  assert.equal(ctx.koerte, 0);
  assert.equal(baand.length, 1);
  assert.match(baand[0].boern[0].textContent, /nøgle/);
});

test("en midlertidig serverfejl giver hverken runner eller bånd", () => {
  const { ctx, baand } = koer(503, "koerte=1");
  assert.equal(ctx.koerte, 0);
  assert.equal(baand.length, 0);
});
