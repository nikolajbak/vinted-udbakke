// Fanger kald til funktioner, der ikke findes.
//
// Runnerne lever inde i en String.raw-tekst, saa hverken TypeScript eller
// deploy ser dem som kode. `node --check` fanger syntaksfejl, men ikke en
// funktion, der ER kaldt og IKKE defineret - og netop dét skete: en
// tekst-erstatning slettede fire funktioner, scriptet blev udgivet, og fejlen
// dukkede foerst op paa telefonen som "Can't find variable".
//
// Det skete IGEN, og den gang i app.js: en erstatning fra "her" til "der"
// slugte renderDetail, fordi den laa imellem. `node --check` var gron, og
// udgivelsen gik igennem - appen kunne bare ikke aabne et udkast. Derfor
// tjekker den her nu ogsaa almindelige .js-filer: har filen ingen
// String.raw-runner, laeses hele filen som kode.
import { readFileSync } from "node:fs";

const GLOBALE = new Set([
  "if","for","while","switch","catch","return","typeof","function","await","new",
  "Promise","Array","Object","String","Number","Math","Date","JSON","parseInt",
  "parseFloat","setTimeout","clearTimeout","setInterval","clearInterval",
  "requestAnimationFrame","cancelAnimationFrame",
  "fetch","alert","confirm","eval","DataTransfer",
  "File","Event","InputEvent","KeyboardEvent","FocusEvent","DOMParser","AbortController",
  "encodeURIComponent","decodeURIComponent","Boolean","RegExp","Error",
  "isFinite","isNaN","atob","btoa","parse","stringify",
  // Browseren, som appen bruger den
  "document","window","navigator","location","history","localStorage",
  "sessionStorage","console","matchMedia","getComputedStyle","print","open",
  "Image","Blob","FileReader","FormData","URL","Uint8Array","Set","Map",
  "IntersectionObserver","MutationObserver","CustomEvent","Notification",
]);

let fejl = 0;
for (const sti of process.argv.slice(2)) {
  const kilde = readFileSync(sti, "utf8");
  const m = kilde.match(/String\.raw`([\s\S]*)`;\s*$/);
  // En .ts-fil SKAL have sin runner-tekst; en .js-fil er selv koden.
  if (!m && /\.ts$/.test(sti)) {
    console.error(`${sti}: fandt ingen RUNNER-tekst`); fejl++; continue;
  }
  const raatekst = m ? m[1] : kilde;
  // Kommentarer og tekststrenge ud foerst: dansk prosa som "annoncer (" og
  // farver som "rgba(" ligner ellers funktionskald.
  const kode = raatekst
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  const defineret = new Set();
  for (const d of kode.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) defineret.add(d[1]);
  for (const d of kode.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/g)) defineret.add(d[1]);
  // Parametre taeller med. En tilbagekaldsfunktion, der bliver KALDT gennem
  // sin parameter, er ikke en manglende funktion - og uden det her raabte
  // tjekket op om hver eneste callback.
  for (const d of kode.matchAll(/function\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)|function\s*\(([^)]*)\)/g)) {
    for (const navn of (d[1] ?? d[2] ?? "").split(",")) {
      const n = navn.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) defineret.add(n);
    }
  }

  const manglende = new Set();
  for (const k of kode.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const navn = k[1];
    if (GLOBALE.has(navn) || defineret.has(navn)) continue;
    if (/^[A-Z]/.test(navn)) continue;          // konstruktorer og globale klasser
    if (kode.includes("var " + navn) || kode.includes("let " + navn)) continue;
    manglende.add(navn);
  }
  if (manglende.size) {
    console.error(`${sti}: kaldt men ikke defineret → ${[...manglende].join(", ")}`);
    fejl++;
  } else {
    console.log(`${sti}: ok (${defineret.size} funktioner)`);
  }
}
process.exit(fejl ? 1 : 0);
