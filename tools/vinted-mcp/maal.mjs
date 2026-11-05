// Dagens måling: kalder get_trending for hver linje i soegninger.txt, så væksten
// ligger klar i historik.jsonl uden et manuelt kald. Ingen modelkald.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROD = path.join(os.homedir(), ".local/share/vinted-mcp");
const BUNDLE = path.join(ROD, "kode/dist/bundle.js");
const HISTORIK = path.join(ROD, "historik.jsonl");
const SOEGNINGER = path.join(path.dirname(new URL(import.meta.url).pathname), "soegninger.txt");
const PAUSE_MS = 5000;
const BEHOLD_DAGE = 60;
const SVAR_MS = 120000;

const log = (t) => console.log(`${new Date().toISOString()} ${t}`);

// Gamle målinger væk, så filen, get_trending læser hele, ikke vokser for evigt.
function ryd() {
  if (!fs.existsSync(HISTORIK)) return;
  const graense = Date.now() - BEHOLD_DAGE * 86400000;
  const linjer = fs.readFileSync(HISTORIK, "utf8").split("\n").filter((l) => {
    try { return JSON.parse(l).tid >= graense; } catch { return false; }
  });
  fs.writeFileSync(HISTORIK, linjer.map((l) => l + "\n").join(""));
}

const soegninger = fs.readFileSync(SOEGNINGER, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
ryd();

// Kører i ROD, så serveren ikke indlæser en .env fra en anden mappe.
const p = spawn(process.execPath, [BUNDLE], { cwd: ROD, env: { PATH: process.env.PATH, HOME: os.homedir(), VINTED_AUTH_MODE: "http" }, stdio: ["pipe", "pipe", "ignore"] });
let n = 0, buf = "";
const venter = new Map();
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const l = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!l.trim()) continue;
    const m = JSON.parse(l);
    if (venter.has(m.id)) { venter.get(m.id)(m); venter.delete(m.id); }
  }
});
const kald = (method, params) => new Promise((ok, nej) => {
  const id = ++n;
  const t = setTimeout(() => nej(new Error(`intet svar på ${method}`)), SVAR_MS);
  venter.set(id, (m) => { clearTimeout(t); ok(m); });
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});

let fejl = 0;
try {
  await kald("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "maal", version: "1" } });
  for (const query of soegninger) {
    try {
      const r = await kald("tools/call", { name: "get_trending", arguments: { query, limit: 1 } });
      const tekst = r.result?.content?.[0]?.text || "";
      if (r.error || r.result?.isError) throw new Error(tekst || JSON.stringify(r.error));
      const j = JSON.parse(tekst);
      if (!j.fulgt) throw new Error("0 varer");
      log(`${query}: ${j.fulgt} varer` + (j.vaekst ? `, ${j.vaekst.nyeHjerterIAlt} nye hjerter på ${j.vaekst.timer} t` : ", første måling"));
    } catch (e) {
      fejl++;
      log(`FEJL ${query}: ${String(e.message || e).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
} finally {
  p.kill();
}
log(`færdig: ${soegninger.length - fejl} af ${soegninger.length}`);
process.exit(fejl ? 1 : 0);
