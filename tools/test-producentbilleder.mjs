// node --test tools/test-producentbilleder.mjs
// De rene dele af producentens billeder: kandidaterne fra produktsidens HTML
// og udvaelgelsen af modellens svar.
import test from "node:test";
import assert from "node:assert/strict";
import { billedKandidater, udvaelg } from "../supabase/functions/_shared/producentbilleder.ts";

const SIDE = "https://shop.dk/products/hooded-puffer-sort";

test("kandidater afkoder escapes og dropper ikoner", () => {
  const html = `
    <script>{"img":"https:\\/\\/cdn.x.com\\/a\\/jakke-sort-1.jpg?v=2"}</script>
    <link href="//cdn.x.com/a/logo-dark.png">
    <link href="/favicon-64.png">
    <img src="https://cdn.x.com/a/ikon.svg">
    <img src="//cdn.x.com/a/jakke-sort-1.jpg?v=3">`;
  assert.deepEqual(billedKandidater(html, SIDE, []), ["https://cdn.x.com/a/jakke-sort-1.jpg?v=2"]);
});

test("kandidater: foerst, saa ord fra stien, saa resten", () => {
  const html = `<img src="//cdn.x.com/anbefaling.jpg"><img src="//cdn.x.com/hooded-let-puffer-forfra.png">`;
  assert.deepEqual(billedKandidater(html, SIDE, ["https://cdn.x.com/og.jpg"]), [
    "https://cdn.x.com/og.jpg",
    "https://cdn.x.com/hooded-let-puffer-forfra.png",
    "https://cdn.x.com/anbefaling.jpg",
  ]);
});

test("kandidater: ordet products taeller ikke", () => {
  const html = `<img src="//cdn.x.com/anbefaling.jpg"><img src="//cdn.x.com/products-banner.jpg">`;
  assert.deepEqual(billedKandidater(html, SIDE, []), [
    "https://cdn.x.com/anbefaling.jpg",
    "https://cdn.x.com/products-banner.jpg",
  ]);
});

test("kandidater hoejst 12", () => {
  const html = Array.from({ length: 20 }, (_, i) => `<img src="//cdn.x.com/b${i}.jpg">`).join("");
  assert.equal(billedKandidater(html, SIDE, []).length, 12);
});

test("kandidater: &amp; og \\u002F", () => {
  const html = `"https:\\u002F\\u002Fcdn.x.com\\u002Fb.jpg?w=1&amp;h=2"`;
  assert.deepEqual(billedKandidater(html, SIDE, []), ["https://cdn.x.com/b.jpg?w=1&h=2"]);
});

const K = ["k1", "k2", "k3", "k4", "k5"].map((n) => `https://cdn.x.com/${n}.jpg`);
const ja = (nr, pose) => ({ nr, sammeVare: true, paaPerson: true, pose });

test("udvaelg sorterer efter pose og tager én pr. pose", () => {
  const ud = udvaelg(K, [ja(1, "bagfra"), ja(2, "forfra-hel"), ja(3, "forfra-hel"), ja(4, "naer"), ja(5, "trekvart")]);
  assert.deepEqual(ud.map((b) => b.pose), ["forfra-hel", "trekvart", "bagfra", "naer"]);
  assert.equal(ud[0].url, K[1]);
});

test("udvaelg dropper andre varer, pakkeshot og ukendte nr", () => {
  const ud = udvaelg(K, [
    { nr: 1, sammeVare: false, paaPerson: true, pose: "forfra-hel" },
    { nr: 2, sammeVare: true, paaPerson: false, pose: "forfra-hel" },
    ja(3, "pakkeshot"),
    ja(99, "forfra-hel"),
  ]);
  assert.deepEqual(ud, []);
});

test("kandidater kaster ikke paa andet end tekst", () => {
  assert.deepEqual(billedKandidater(undefined, SIDE, [null, undefined, 7, { url: 1 }]), []);
  assert.deepEqual(billedKandidater("", "ikke en adresse", undefined), []);
});

test("kandidater: relativ adresse i foerst loeses mod siden, http bliver https", () => {
  assert.deepEqual(billedKandidater("", SIDE, ["/files/a.jpg", "http://cdn.x.com/b.jpg"]),
    ["https://shop.dk/files/a.jpg", "https://cdn.x.com/b.jpg"]);
});

test("kandidater: Shopify-skabelon droppes, bredder er samme billede", () => {
  const html = `<img src="//cdn.shopify.com/f/hooded_{width}x.jpg?v=1">
    <img srcset="//cdn.shopify.com/f/a_200x.jpg?v=1 200w, //cdn.shopify.com/f/a_800x.jpg?v=1 800w, //cdn.shopify.com/f/a_1200x1600.jpg 1200w">
    <img src="//cdn.shopify.com/f/b%7Bwidth%7D.jpg">`;
  assert.deepEqual(billedKandidater(html, SIDE, []), ["https://cdn.shopify.com/f/a_200x.jpg?v=1&width=1200"]);
});

test("kandidater: Shopify-billeder hentes i 1200 px bredde", () => {
  const html = `<img src="//teeshoppen.dk/cdn/shop/files/jakke-set-forfra.png?v=17&amp;width=360&amp;height=482&amp;crop=center">`;
  assert.deepEqual(billedKandidater(html, SIDE, []), ["https://teeshoppen.dk/cdn/shop/files/jakke-set-forfra.png?v=17&width=1200"]);
  const cdn = `<img src="//cdn.shopify.com/s/files/a.jpg?v=1&width=200">`;
  assert.deepEqual(billedKandidater(cdn, SIDE, []), ["https://cdn.shopify.com/s/files/a.jpg?v=1&width=1200"]);
});

test("kandidater: &quot; afkodes og slutter adressen", () => {
  const html = `data-x="{&quot;src&quot;:&quot;//cdn.x.com/a.jpg?sh=1000&quot;}"`;
  assert.deepEqual(billedKandidater(html, SIDE, []), ["https://cdn.x.com/a.jpg?sh=1000"]);
});
