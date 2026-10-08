// Brugerscripterne til Vinted og DBA. Et brugerscript er kun en indlaeser: det
// henter runneren fra ?script=1 ved hver sideindlaesning, saa en rettelse i
// runneren rammer telefonen uden at noget skal opdateres. Kun hovedet
// (@match) og selve indlaeseren kraever en ny udgave - og naar de goer, skal
// telefonen selv sige til.
//
// Tre ting skal til, for at det sker af sig selv:
// - Versionen skal STIGE. Userscripts opdaterer kun til et stoerre nummer, og
//   et hash af indholdet kan vaere mindre end det forrige. Nummeret kommer fra
//   databasen (brugerscript_udgave, sql/010): nyt indhold, naeste nummer.
// - @updateURL peger paa .meta.js - kun hovedet - som Userscripts selv kigger
//   paa med mellemrum.
// - Indlaeseren fortaeller runneren, hvilken udgave den er. Er den gammel,
//   viser siden et baand med en knap, der aabner den nye udgave, hvor
//   Userscripts tilbyder at opdatere. Userscripts' egen opdatering er ikke til
//   at stole paa (dens README siger det selv), saa baandet er det, der virker.

export type Brugerscript = {
  navn: string; // noegle i brugerscripter + navnet i Userscripts
  beskrivelse: string;
  fil: string; // "udbakke" -> udbakke.user.js / udbakke.meta.js
  base: string; // funktionens adresse udefra
  noegle: string;
  match: string[];
  apiVar: string; // window-navne; maa aldrig omdoebes (se CLAUDE.md)
  autoVar: string;
  verVar: string;
};

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const api = (b: Brugerscript) => `${b.base}?key=${b.noegle}`;
const adresse = (b: Brugerscript, endelse: string) => `${b.base}/${b.fil}.${endelse}?key=${b.noegle}`;
export const installAdresse = (b: Brugerscript) => adresse(b, "user.js");

function indlaeser(b: Brugerscript, version: string): string {
  return [
    `window.${b.apiVar}=${JSON.stringify(api(b))};`,
    `window.${b.autoVar}=true;`,
    `window.${b.verVar}=${JSON.stringify(version)};`,
    "(function(){",
    " var x=new XMLHttpRequest();",
    ` x.open('GET',window.${b.apiVar}+'&script=1&v='+encodeURIComponent(window.${b.verVar}));`,
    " x.onload=function(){if(x.status===200)(0,eval)(x.responseText)};",
    " x.send();",
    "})();",
  ].join("\n");
}

function hoved(b: Brugerscript, version: string): string {
  return [
    "// ==UserScript==",
    `// @name         ${b.navn}`,
    "// @namespace    udbakke",
    `// @version      ${version}`,
    `// @description  ${b.beskrivelse}`,
    ...b.match.map((m) => `// @match        ${m}`),
    "// @run-at       document-idle",
    "// @grant        none",
    "// @inject-into  page",
    `// @downloadURL  ${adresse(b, "user.js")}`,
    `// @updateURL    ${adresse(b, "meta.js")}`,
    "// ==/UserScript==",
  ].join("\n");
}

// Nummeret huskes i instansen: det aendrer sig kun ved en ny udrulning, og saa
// starter instansen forfra.
let husket: { noegle: string; version: string } | null = null;
export async function udgave(b: Brugerscript, db: Db): Promise<string | null> {
  const h = hash(hoved(b, "") + "\n" + indlaeser(b, ""));
  if (husket?.noegle === h) return husket.version;
  const { data, error } = await db.rpc("brugerscript_udgave", { p_navn: b.navn, p_hash: h });
  if (error || typeof data !== "number") {
    console.error("brugerscript_udgave", error);
    return null;
  }
  // 2.0.n: de gamle udgaver hed 1.0.<hash>, og alle skal under 2.
  const version = `2.0.${data}`;
  husket = { noegle: h, version };
  return version;
}

// .user.js og .meta.js. null: ikke et brugerscript-kald.
export async function brugerscriptSvar(url: URL, b: Brugerscript, db: Db, cors: Record<string, string>) {
  const meta = url.pathname.endsWith(".meta.js");
  if (!meta && !url.pathname.endsWith(".user.js") && url.searchParams.get("userscript") !== "1") return null;
  const version = await udgave(b, db);
  if (!version) return new Response("// udgaven kunne ikke slaas op", { status: 503, headers: cors });
  const tekst = meta ? hoved(b, version) : hoved(b, version) + "\n\n" + indlaeser(b, version);
  // text/plain, ikke text/javascript: ellers henter Safari filen ned i stedet
  // for at vise den, og saa har udvidelsen ingen side at tilbyde installation
  // paa.
  return new Response(tekst, {
    headers: { ...cors, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

// Hvad puls skal sige om udgaven: indlaeseren sender sin udgave med (&v=).
// Uden v er det bogmaerket eller et brugerscript fra foer 8. oktober.
export function udgaveTekst(url: URL, version: string | null): string {
  const v = url.searchParams.get("v");
  if (!v || !version) return "";
  return v === version ? ` · brugerscript ${v}` : ` · brugerscript forældet (${v}, ny: ${version})`;
}

// Saettes foran runneren. Koerer kun i automatisk tilstand (brugerscriptet,
// ikke bogmaerket), og kun naar den installerede udgave ikke er den nyeste.
// Et brugerscript fra foer 8. oktober saetter slet ingen udgave og faar ogsaa
// baandet. Lukker du det, kommer det igen om seks timer.
export function varsel(b: Brugerscript, version: string | null): string {
  if (!version) return "";
  const n = JSON.stringify({ v: version, url: installAdresse(b), k: "udbakke_opdater_" + b.fil });
  return `(function(){try{
var N=${n};
if(!window.${b.autoVar}||window.${b.verVar}===N.v)return;
try{var s=+localStorage.getItem(N.k)||0;if(Date.now()-s<21600000)return}catch(e){}
function vis(){
 var d=document.createElement('div');
 d.setAttribute('style','position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#7a4b00;color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;padding:10px 14px;display:flex;gap:12px;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.25)');
 var t=document.createElement('span');
 t.textContent='${b.navn} har en ny udgave. Tryk Opdatér, og så ᴀA → Userscripts → Update/Install.';
 var k=document.createElement('button');k.type='button';k.textContent='Opdatér';
 k.setAttribute('style','background:#fff;color:#7a4b00;border:0;border-radius:6px;padding:6px 12px;font:600 14px -apple-system,system-ui,sans-serif');
 k.addEventListener('click',function(){location.href=N.url});
 var x=document.createElement('button');x.type='button';x.textContent='×';
 x.setAttribute('style','background:none;border:0;color:#fff;font-size:20px;line-height:1');
 x.addEventListener('click',function(){d.remove();try{localStorage.setItem(N.k,String(Date.now()))}catch(e){}});
 d.appendChild(t);d.appendChild(k);d.appendChild(x);document.body.appendChild(d);
}
if(document.body)vis();else document.addEventListener('DOMContentLoaded',vis);
}catch(e){}})();
`;
}
