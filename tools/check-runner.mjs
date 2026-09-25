// Fanger kald til funktioner, der ikke findes.
//
// Runnerne lever inde i en String.raw-tekst, saa hverken TypeScript eller
// deploy ser dem som kode. `node --check` fanger syntaksfejl, men ikke en
// funktion, der ER kaldt og IKKE defineret - og netop dét skete: en
// tekst-erstatning slettede fire funktioner, scriptet blev udgivet, og fejlen
// dukkede foerst op paa telefonen som "Can't find variable".
import { readFileSync } from "node:fs";

const GLOBALE = new Set([
  "if","for","while","switch","catch","return","typeof","function","await","new",
  "Promise","Array","Object","String","Number","Math","Date","JSON","parseInt",
  "parseFloat","setTimeout","clearTimeout","fetch","alert","eval","DataTransfer",
  "File","Event","InputEvent","KeyboardEvent","FocusEvent","DOMParser","AbortController",
  "encodeURIComponent","decodeURIComponent","Boolean","RegExp","Error",
  "isFinite","isNaN",
]);

let fejl = 0;
for (const sti of process.argv.slice(2)) {
  const kilde = readFileSync(sti, "utf8");
  const m = kilde.match(/String\.raw`([\s\S]*)`;\s*$/);
  if (!m) { console.error(`${sti}: fandt ingen RUNNER-tekst`); fejl++; continue; }
  // Kommentarer og tekststrenge ud foerst: dansk prosa som "annoncer (" og
  // farver som "rgba(" ligner ellers funktionskald.
  const kode = m[1]
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  const defineret = new Set();
  for (const d of kode.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) defineret.add(d[1]);
  for (const d of kode.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/g)) defineret.add(d[1]);

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
