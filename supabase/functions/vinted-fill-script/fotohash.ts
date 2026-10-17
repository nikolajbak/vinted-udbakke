// Billederne genkendt paa indholdet, naar Vinted har lagt dem op paa ny.
//
// Vinteds egen app lægger ALLE billeder op igen ved Gem: nye id'er, nye
// adresser og intet, der binder dem til de gamle (17. oktober, nr. 55). Saa
// parres de paa selve billedet: en lille udgave af hver side (Vinteds
// miniature, Storage's billedtransformation af appens) koges ned til et
// fingeraftryk, og hvert Vinted-billede faar det app-billede, det ligner mest
// - men kun naar parret er entydigt. Hellere ingen parring end en forkert.
import { decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const SIDE = 16; // 16x16 felter: et aftryk af lysstyrken (gennemsnit pr. felt)

// Et billede som SIDE x SIDE gennemsnitlig lysstyrke, hele billedet med.
// Vinteds miniature er 150x210 af et 600x800-billede, saa formatet kan
// afvige lidt fra appens; felterne regnes i forhold til bredde og hoejde.
export async function aftryk(bytes: Uint8Array): Promise<Float32Array> {
  const img = await decode(bytes);
  // deno-lint-ignore no-explicit-any
  const w = (img as any).width as number, h = (img as any).height as number;
  // deno-lint-ignore no-explicit-any
  const px = (img as any).bitmap as Uint8ClampedArray;
  const sum = new Float64Array(SIDE * SIDE), n = new Float64Array(SIDE * SIDE);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(SIDE - 1, Math.floor((y * SIDE) / h));
    for (let x = 0; x < w; x++) {
      const fx = Math.min(SIDE - 1, Math.floor((x * SIDE) / w));
      const i = (y * w + x) * 4;
      sum[fy * SIDE + fx] += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      n[fy * SIDE + fx]++;
    }
  }
  const ud = new Float32Array(SIDE * SIDE);
  for (let k = 0; k < ud.length; k++) ud[k] = n[k] ? sum[k] / n[k] : 0;
  return ud;
}

// Forskellen mellem to aftryk: 1 - korrelationen (0 = ens, 1 = intet til
// faelles). Korrelationen er ligeglad med lysstyrke og kontrast, som Vinted
// kan aendre ved omkodningen.
export function afstand(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  if (!saa || !sbb) return 1;
  return 1 - sab / Math.sqrt(saa * sbb);
}

// Taersklerne er maalt 17. oktober paa nr. 55 (12 billeder af samme gule
// jakke, flere naesten ens): de rigtige par laa paa 0,006-0,071, det
// naestbedste paa mindst 0,35, og mod 32 billeder af tre andre jakker
// (nr. 54, 56, 57) var intet under 0,37.
const MAKS = 0.15;     // et par skal ligne mindst saa meget
const AFSTAND = 0.15;  // ... og det naestbedste skal ligge saa meget laengere vaek

// Appens billede i lille udgave via Storage's billedtransformation (~6 kB
// mod ~490 kB). Begge maal og `contain`, ellers strækkes det: `?width=150`
// alene gav 150x1600.
export function lilleUdgave(path: string): string {
  const base = Deno.env.get("SUPABASE_URL")!;
  return `${base}/storage/v1/render/image/public/photos/${path.split("/").map(encodeURIComponent).join("/")}` +
    "?width=160&height=160&resize=contain";
}

export type Vfoto = { id: string; url?: string };
export type Afoto = { rod: string; path: string };

// Hvert Vinted-billede parret med et app-billede - eller intet, med grunden.
// Entydigt betyder: hvert Vinted-billede har ét klart bedste app-billede,
// det app-billede har netop det Vinted-billede som sit bedste, og intet
// app-billede bruges to gange.
export async function genkend(vinted: Vfoto[], app: Afoto[]):
  Promise<{ kort: Array<{ id: string; rod: string }>; afstande: number[] } | { grund: string }> {
  if (!vinted.length) return { grund: "ingen billeder fra Vinted" };
  if (vinted.some((v) => !v.url)) return { grund: "Vinteds miniaturer mangler" };
  if (!app.length) return { grund: "udkastet har ingen billeder" };
  if (vinted.length > app.length) return { grund: `Vinted har ${vinted.length} billeder, appen ${app.length}` };
  const hent = async (u: string) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 60)}`);
    return aftryk(new Uint8Array(await r.arrayBuffer()));
  };
  let V: Float32Array[], A: Float32Array[];
  try {
    [V, A] = await Promise.all([
      Promise.all(vinted.map((v) => hent(v.url!))),
      Promise.all(app.map((a) => hent(lilleUdgave(a.path)))),
    ]);
  } catch (e) {
    return { grund: "billederne kunne ikke hentes: " + String((e as Error)?.message ?? e) };
  }
  const m = V.map((v) => A.map((a) => afstand(v, a)));
  const kort: Array<{ id: string; rod: string }> = [], afstande: number[] = [], brugt = new Set<number>();
  for (let i = 0; i < m.length; i++) {
    const r = m[i], orden = r.map((_, j) => j).sort((x, y) => r[x] - r[y]);
    const j = orden[0], d = r[j], naest = orden.length > 1 ? r[orden[1]] : 1;
    if (d > MAKS || naest - d < AFSTAND) {
      return { grund: `billede ${i + 1} på Vinted ligner intet af appens entydigt (${d.toFixed(2)} / ${naest.toFixed(2)})` };
    }
    let bedsteI = 0;
    for (let k = 1; k < m.length; k++) if (m[k][j] < m[bedsteI][j]) bedsteI = k;
    if (bedsteI !== i || brugt.has(j)) return { grund: `billede ${i + 1} på Vinted deler sit bedste match med et andet` };
    brugt.add(j);
    kort.push({ id: vinted[i].id, rod: app[j].rod });
    afstande.push(Math.round(d * 1000) / 1000);
  }
  return { kort, afstande };
}
