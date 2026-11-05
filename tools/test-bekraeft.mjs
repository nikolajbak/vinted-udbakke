// node --test tools/test-bekraeft.mjs
// Kvitteringen efter Gem (laesFrisk og bekraeftNu i runner.ts), kørt som den
// står i runneren. Målt 5. november: Vinted svarer med en fejlside i op til
// ca. 70 s efter en gemning, og runneren gav op efter ca. 10 s.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const kilde = readFileSync(new URL("../supabase/functions/vinted-fill-script/runner.ts", import.meta.url), "utf8");
const fra = kilde.indexOf("async function laesFrisk(");
const til = kilde.indexOf("// Vaelgerne efter Gem");
assert.ok(fra > 0 && til > fra, "fandt ikke funktionerne i runneren");
const kode = kilde.slice(fra, til);

// svar: ét element pr. hentning. Tal = HTTP-status, "ok"/"gammel" = en læselig side, "fejl" = netværk væk.
async function koer(svar, v = {}) {
  const spor = [], baand = [], ventet = [];
  let kvitteret = 0, hentet = 0;
  const ctx = {
    MARKOER: "m", localStorage: { removeItem() {} },
    spor: (s) => spor.push(s),
    baand: (t) => { baand.push(t); return { remove() {} }; },
    sleep: async (ms) => { ventet.push(ms); },
    timedFetch: async () => {
      const s = svar[Math.min(hentet++, svar.length - 1)];
      if (s === "fejl") throw new Error("Load failed");
      if (typeof s === "number") return { status: s, ok: s < 400, text: async () => "" };
      return { status: 200, ok: true, text: async () => s };
    },
    laesAnnonceside: (t) => t === "solgt" ? { gone: true, udgivet: null } : t === "ulaeselig" ? null : { udgivet: { price: t === "ok" ? 100 : 50 } },
    sammeValg: (n, a, b) => a === b,
    medValg: async () => {},
    kvitter: async () => { kvitteret++; return { ok: true }; },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(kode + "\nglobalThis.bekraeftNu=bekraeftNu;", ctx);
  const ud = await ctx.bekraeftNu({ itemId: "7", satte: ["price"], felter: { price: 100 }, ...v });
  return { ud, spor, baand, ventet, hentet, kvitteret };
}

test("læst i første forsøg: kvitteret uden at vente", async () => {
  const r = await koer(["ok"]);
  assert.equal(r.kvitteret, 1);
  assert.equal(r.hentet, 1);
  assert.deepEqual(r.ventet, []);
});

test("fejlsiden går over efter ca. et minut: kvitteret, intet falsk alarm-bånd", async () => {
  const r = await koer([503, 503, 503, 503, 503, 503, "ok"]);
  assert.equal(r.kvitteret, 1);
  assert.ok(r.ventet.reduce((a, b) => a + b, 0) >= 50000, "skal have ventet mindst 50 s: " + r.ventet);
  assert.ok(!r.baand.some((t) => /kunne ikke læses/.test(t)));
});

test("kan aldrig læses: giver op inden for 90 s og skriver status og antal forsøg i spor", async () => {
  const r = await koer([403]);
  assert.equal(r.kvitteret, 0);
  assert.ok(r.ventet.reduce((a, b) => a + b, 0) <= 90000);
  assert.match(r.spor.at(-1), /7 kunne ikke læses \(http 403, \d+ forsøg\)/);
});

test("netværksfejl står også i spor", async () => {
  const r = await koer(["fejl"]);
  assert.match(r.spor.at(-1), /Load failed/);
});

test("en side uden varens data står som sådan i spor", async () => {
  const r = await koer(["ulaeselig"]);
  assert.match(r.spor.at(-1), /siden kunne ikke tolkes/);
});

test("læselig, men Vinted viser stadig den gamle pris: stopper efter fire forsøg som før", async () => {
  const r = await koer(["gammel"]);
  assert.equal(r.hentet, 4);
  assert.equal(r.kvitteret, 1);
});

test("en læsning, der fejler efter en god, sletter ikke den gode", async () => {
  const r = await koer(["gammel", "gammel", "gammel", 503]);
  assert.equal(r.hentet, 4);
  assert.equal(r.kvitteret, 1);
});

test("solgt under vejs: ingen lang venten", async () => {
  const r = await koer(["solgt"]);
  assert.equal(r.hentet, 1);
  assert.match(r.spor.at(-1), /solgt/);
});
