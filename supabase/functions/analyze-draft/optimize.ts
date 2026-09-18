// AI-styret billedoptimering: en vision-model finder rotation og hvor varen
// faktisk er i billedet, og vi beskærer efter dét i stedet for blindt at tage
// midten (som kan skære tøjet over). Fejler noget her, beholder vi originalen
// — et dårligt beskåret billede er bedre end intet udkast.

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

// Fremkaldelsen af en hel serie. Maales én gang og genbruges, saa varen ser
// ens ud paa alle billeder.
export interface Tone {
  gains: [number, number, number];
  black: number;
  white: number;
  gamma: number;
}

export interface PhotoGuidance {
  tone?: Tone;
  toneOut?: { tone?: Tone };
  rotationDegrees: number;
  subject?: string;
  subjectCutOff?: boolean;
  backgroundClutter?: boolean;
  padStyle?: string;
  crop: { x0: number; y0: number; x1: number; y1: number };
  look?: { exposure?: number; contrast?: number; warmth?: number; saturation?: number };
  mask?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  protect?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
}

// Vinted viser annoncebilleder i portræt, men at tvinge 4:5 ned over en bred
// vare (en jakke med ærmerne ud) fylder rammen med gulv. Vi tillader derfor
// alt mellem kvadratisk og 4:5 og vælger det, der ligger tættest på varens
// egen facon.
// En jakke med ærmerne ud er bredere end høj. Tvinger man den ned i portræt,
// skal rammen vokse i højden - og så kommer gulvet, fødderne og bordkanten med
// ind igen, præcis dét beskæringen skulle af med. Derfor får brede varer lov
// at ligge lidt på tværs.
// Maalt paa Vinted selv: hver eneste annonce vises med 800 px paa den lange
// kant, og den kopi, de beholder til zoom, er 1200x1600 - aldrig stoerre.
// 3:4 er altsaa deres eget format, saa en hoej vare faar lov at ramme det
// praecist i stedet for at blive vist med sorte kanter i gitteret.
const RATIO_MAX = 1.2;     // let liggende, til brede varer
const RATIO_MIN = 3 / 4;   // Vinteds eget portrætformat
// Vinteds loft. Mere kasserer de selv ved upload; mindre koster zoom-detalje,
// og zoom er dér, en koeber bedoemmer stoffet.
const MAX_EDGE = 1600;

// Luften omkring motivet er ikke én værdi. En hel vare tåler en stram ramme;
// en tekst eller et logo gør ikke. Klistrer et mærkenavn op ad kanten, læser
// det som en fejl — også når teksten i sig selv er hel.
//
// Er motivet ALLEREDE skåret af i originalen, kan beskæringen ikke skabe det
// manglende. Så er det rigtige at gå længere væk: rammen bliver bred, motivet
// fylder mindre, og det afskårne læses som en tilfældighed frem for at være
// dét, billedet handler om.
const PADDING: Record<string, number> = {
  helvare: 0.035,
  maerkat: 0.18,
  logo: 0.18,
  detalje: 0.10,
  slid: 0.08,
};
const PADDING_DEFAULT = 0.05;
// Naar varen isoleres paa hvidt, er den hvide ramme luften. Beskaeringen
// skal derfor kun holde en haarsbred, saa varen ikke roerer kanten.
const PADDING_ISOLERET = 0.012;
const PADDING_CUT_OFF = 0.28;

export const GUIDANCE_TOOL = {
  name: "vurder_billede",
  description:
    "Angiv hvordan dette ene billede skal roteres og beskæres, så varen står bedst i en Vinted-annonce.",
  input_schema: {
    type: "object",
    properties: {
      rotationDegrees: {
        type: "integer",
        description:
          "0, 90, 180 eller 270 — hvor meget billedet skal roteres MED URET. " +
          "Spørgsmålet er IKKE, hvad der vendte opad, da fotoet blev taget: telefonen kan have " +
          "været holdt på højkant, på skrå eller på hovedet, og det siger intet om varen. " +
          "Spørgsmålet er, hvilken af de fire drejninger der viser VAREN bedst — sådan som den " +
          "ville blive vist i en butik eller et katalog. En overdel med skuldre og krave øverst " +
          "og kanten nederst. Et par bukser med linningen øverst og benene nedad. Et par sko " +
          "stående på sålen. Er der tekst i billedet (mærkat, vaskeanvisning, logo, tryk), " +
          "afgør læseretningen det: teksten skal kunne læses vandret fra venstre mod højre. " +
          "Ligger varen løst på et bord uden en oplagt top og bund, så vælg den drejning, der " +
          "giver den roligste, mest genkendelige silhuet.",
      },
      subject: {
        type: "string",
        enum: ["helvare", "maerkat", "logo", "detalje", "slid"],
        description:
          "Hvad billedet handler om. \"helvare\" = hele tøjstykket. \"maerkat\" = et syet mærke med " +
          "tekst (mærkenavn, størrelse, vaskeanvisning). \"logo\" = et trykt eller præget logo på " +
          "stoffet. \"detalje\" = en lynlås, knap, lomme, søm eller lignende. \"slid\" = en plet, " +
          "et hul eller en misfarvning, køberen skal kunne bedømme.",
      },
      subjectCutOff: {
        type: "boolean",
        description:
          "true hvis motivet allerede er skåret af billedets kant i det ORIGINALE foto — fx et logo " +
          "eller en tekst, hvor en del mangler ud over kanten. Det kan ikke laves om ved beskæring, " +
          "men rammen skal så lægges bredere, så det ikke springer i øjnene.",
      },
      backgroundClutter: {
        type: "boolean",
        description:
          "true hvis der er forstyrrende baggrund TÆT på motivet, som ikke kan beskæres væk uden " +
          "at skære i selve varen: fotografens fødder eller ben, en hånd, en sengekant, en " +
          "bordkant, et møbel, andet tøj eller genstande. Er baggrunden rolig og ensartet — et " +
          "rent gulv, en væg, et lagen uden kanter i billedet — så svar false.",
      },
      x0: { type: "number", description: "Venstre kant af motivet, 0-1 af bredden" },
      y0: { type: "number", description: "Øverste kant af motivet, 0-1 af højden" },
      x1: { type: "number", description: "Højre kant af motivet, 0-1" },
      y1: { type: "number", description: "Nederste kant af motivet, 0-1" },
      protectRegions: {
        type: "array",
        description:
          "Områder der ALDRIG må maskeres, fordi de skal forblive læsbare: mærkemærkatet med " +
          "brandnavnet, og mærkatet med størrelse eller vaskeanvisning. Angiv dem, også når de " +
          "ligger tæt på eller delvist under et navnemærke. Tom liste hvis der ingen er.",
        items: {
          type: "object",
          properties: {
            x0: { type: "number" }, y0: { type: "number" },
            x1: { type: "number" }, y1: { type: "number" },
          },
          required: ["x0", "y0", "x1", "y1"],
        },
      },
      personalRegions: {
        type: "array",
        description:
          "Områder der skal maskeres, fordi de viser PERSONLIGE oplysninger: påsyede navnemærker, " +
          "et barns navn, adresse, telefonnummer eller lignende. Tom liste hvis der ikke er noget. " +
          "Maskér ALDRIG mærkemærkater, størrelses- eller vaskemærker — de skal forblive læsbare, " +
          "da de er hele grunden til billedet.",
        items: {
          type: "object",
          properties: {
            x0: { type: "number", description: "Venstre kant, 0-1 af bredden" },
            y0: { type: "number", description: "Øverste kant, 0-1 af højden" },
            x1: { type: "number", description: "Højre kant, 0-1" },
            y1: { type: "number", description: "Nederste kant, 0-1" },
          },
          required: ["x0", "y0", "x1", "y1"],
        },
      },
      exposure: {
        type: "number",
        description:
          "Eksponering, -0.5 til 0.5. Positiv gør billedet lysere. Mørkt tøj i dårligt lys ligger typisk på 0.15-0.35.",
      },
      contrast: {
        type: "number",
        description: "Kontrast, -0.4 til 0.4. Positiv giver dybere sort og renere hvid i et fladt billede.",
      },
      warmth: {
        type: "number",
        description:
          "Farvetemperatur, -0.5 til 0.5. NEGATIV køler et orange/gult farvestik ned (fx trægulv eller gult pærelys). Positiv varmer et blåligt billede op.",
      },
      saturation: {
        type: "number",
        description: "Farvemætning, -0.3 til 0.3. Let positiv giver mere liv; negativ dæmper overmættede farver.",
      },
    },
    required: [
      "rotationDegrees", "subject", "subjectCutOff", "backgroundClutter", "x0", "y0", "x1", "y1",
      "personalRegions", "protectRegions", "exposure", "contrast", "warmth", "saturation",
    ],
  },
};


const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

/**
 * Pixelerer de områder, modellen har udpeget som personlige (typisk et påsyet
 * navnemærke). Blokkene er store nok til at teksten ikke kan rekonstrueres,
 * men det ser stadig ud som et foto frem for en sort bjælke.
 * Køres på originalen FØR rotation og beskæring, så koordinaterne passer.
 */
function maskRegions(
  image: { bitmap: Uint8ClampedArray; width: number; height: number },
  regions: Array<{ x0: number; y0: number; x1: number; y1: number }>,
  protect: Array<{ x0: number; y0: number; x1: number; y1: number }> = [],
): void {
  const { width: W, height: H } = image;
  const px = image.bitmap;
  // Kassen daekker hele navneklistermaerket som objekt, ikke teksten alene —
  // objektkanter rammer modellen paalideligt, tekstkanter goer den ikke.
  const PAD = 0.008;
  // De fredede maerkater faar en margen udad. Rammer masken bare kanten af
  // "SIZE 120", er stoerrelsen vaek - og stoerrelsen er halvdelen af grunden
  // til, at billedet er der.
  const GUARD_PAD = 0.012;

  for (const r of regions) {
    const x0 = Math.max(0, Math.floor((Math.min(r.x0, r.x1) - PAD) * W));
    const y0 = Math.max(0, Math.floor((Math.min(r.y0, r.y1) - PAD) * H));
    const x1 = Math.min(W, Math.ceil((Math.max(r.x0, r.x1) + PAD) * W));
    const y1 = Math.min(H, Math.ceil((Math.max(r.y0, r.y1) + PAD) * H));
    if (x1 <= x0 || y1 <= y0) continue;

    // Navnelapper overlapper tit stoerrelsesmaerkatet. Beskyttede felter
    // springes over pixel for pixel, saa navnet daekkes helt UDEN at "SIZE 120"
    // ryger med — noget en firkantet maske alene ikke kan.
    const guards = protect.map(function (g) {
      return {
        x0: Math.floor((Math.min(g.x0, g.x1) - GUARD_PAD) * W),
        y0: Math.floor((Math.min(g.y0, g.y1) - GUARD_PAD) * H),
        x1: Math.ceil((Math.max(g.x0, g.x1) + GUARD_PAD) * W),
        y1: Math.ceil((Math.max(g.y0, g.y1) + GUARD_PAD) * H),
      };
    });
    const guarded = function (x: number, y: number) {
      for (const g of guards) if (x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y1) return true;
      return false;
    };

    const block = Math.max(8, Math.round(Math.min(x1 - x0, y1 - y0) / 6));
    for (let by = y0; by < y1; by += block) {
      for (let bx = x0; bx < x1; bx += block) {
        const ex = Math.min(bx + block, x1), ey = Math.min(by + block, y1);
        let r0 = 0, g0 = 0, b0 = 0, n = 0;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * W + x) * 4;
            r0 += px[i]; g0 += px[i+1]; b0 += px[i+2]; n++;
          }
        }
        if (!n) continue;
        const ar = r0 / n, ag = g0 / n, ab = b0 / n;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            if (guarded(x, y)) continue;
            const i = (y * W + x) * 4;
            px[i] = ar; px[i+1] = ag; px[i+2] = ab;
          }
        }
      }
    }
  }
}

/**
 * Målt grundkorrektion, før modellens skøn overhovedet kommer til.
 *
 * En model kan se, AT et billede er gulligt og mørkt, men ikke hvor meget.
 * Det kan billedet selv svare på: hvidbalancen læses af de lyseste partier,
 * sort- og hvidpunkt af histogrammets haler, og skyggeløftet af medianen.
 * Det er den samme rækkefølge et fremkalderprogram bruger, og den rammer
 * rigtigt hver gang, hvor et skøn rammer nogenlunde.
 *
 * Alt er holdt i stramme tøjler: en annonce skal vise varens rigtige farve.
 * Et billede, der er pænere end virkeligheden, giver en skuffet køber.
 */
function autoTone(image: { bitmap: Uint8ClampedArray }, given?: Tone): Tone | null {
  const px = image.bitmap;
  const pixels = px.length / 4;
  if (!pixels) return null;

  // Er fremkaldelsen allerede maalt paa seriens foerste billede, bruges den som
  // den er. Maaler hvert billede sit eget, faar en jakke med meget gulv i
  // rammen en anden farve end den samme jakke set taettere paa - og det er
  // praecis dét, der faar en annonce til at se roddet ud.
  if (given) {
    applyTone(px, given);
    return given;
  }

  // Ét gennemløb, fire histogrammer. Hvidbalancen blev før læst i et ekstra
  // gennemløb over alle pixels; den kan udledes af kanalernes egne histogrammer
  // og koster så ingenting.
  const lumHist = new Uint32Array(256);
  const ch = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    ch[0][r]++; ch[1][g]++; ch[2][b]++;
    lumHist[(0.2126 * r + 0.7152 * g + 0.0722 * b) | 0]++;
  }

  // De lyseste 10 % af hver kanal: dét, der BURDE være neutralt. Et trægulv
  // eller gult pærelys farver hele billedet, og sort tøj bliver brunligt.
  const brightWanted = Math.max(1, Math.floor(pixels * 0.10));
  const brightMean = (h: Uint32Array) => {
    let n = 0, sum = 0;
    for (let v = 255; v >= 0 && n < brightWanted; v--) {
      const take = Math.min(h[v], brightWanted - n);
      n += take; sum += take * v;
    }
    return n ? sum / n : 0;
  };
  const mr = brightMean(ch[0]), mg = brightMean(ch[1]), mb = brightMean(ch[2]);
  let gainR = 1, gainG = 1, gainB = 1;
  if (mr > 1 && mg > 1 && mb > 1) {
    const mean = (mr + mg + mb) / 3;
    // Stramt loft: en rød kjole fylder også de lyseste partier, og den må ikke
    // blegnes i jagten på en neutral grå.
    const cap = (x: number) => Math.max(0.88, Math.min(1.14, x));
    gainR = cap(mean / mr); gainG = cap(mean / mg); gainB = cap(mean / mb);
  }

  // Sort- og hvidpunkt fra histogrammets haler. 0,3 % i hver ende: nok til at
  // fjerne dis, for lidt til at lukke detaljer i sorte folder.
  const tail = Math.max(1, Math.floor(pixels * 0.003));
  let acc = 0, black = 0, white = 255;
  for (let v = 0; v < 256; v++) { acc += lumHist[v]; if (acc >= tail) { black = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += lumHist[v]; if (acc >= tail) { white = v; break; } }
  black = Math.min(black, 40);
  white = Math.max(white, 205);
  if (white - black < 60) { black = 0; white = 255; }

  // Skyggeløft mod en median omkring 118. Mørkt tøj indendørs lander typisk
  // langt under, og en kurve løfter skyggerne uden at brænde højlysene af,
  // sådan som en ren eksponeringsfaktor gør.
  let half = 0, median = 128;
  const wanted = pixels / 2;
  for (let v = 0; v < 256; v++) { half += lumHist[v]; if (half >= wanted) { median = v; break; } }
  let gamma = 1;
  if (median > 4 && median < 250) {
    gamma = Math.log(118 / 255) / Math.log(median / 255);
    gamma = Math.max(0.62, Math.min(1.25, gamma));
  }

  const tone: Tone = { gains: [gainR, gainG, gainB], black, white, gamma };
  applyTone(px, tone);
  return tone;
}

function applyTone(px: Uint8ClampedArray, t: Tone): void {
  const span = Math.max(1, t.white - t.black);
  const lut = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      const balanced = v * t.gains[c];
      const stretched = Math.max(0, Math.min(1, (balanced - t.black) / span));
      lut[c][v] = clamp255(255 * Math.pow(stretched, t.gamma));
    }
  }
  for (let i = 0; i < px.length; i += 4) {
    px[i] = lut[0][px[i]];
    px[i + 1] = lut[1][px[i + 1]];
    px[i + 2] = lut[2][px[i + 2]];
  }
}

/**
 * Eksponering, hvidbalance, kontrast og mætning i én gennemgang af billedet.
 * Modellen bedømmer HVAD der skal rettes; her udføres det.
 */
function applyLook(
  image: { bitmap: Uint8ClampedArray },
  look: { exposure?: number; contrast?: number; warmth?: number; saturation?: number },
): void {
  const ev = Math.max(-0.5, Math.min(0.5, look.exposure ?? 0));
  const ct = Math.max(-0.4, Math.min(0.4, look.contrast ?? 0));
  const wb = Math.max(-0.5, Math.min(0.5, look.warmth ?? 0));
  const sa = Math.max(-0.3, Math.min(0.3, look.saturation ?? 0));
  if (!ev && !ct && !wb && !sa) return;

  const expGain = 1 + ev;
  const ctGain = 1 + ct;
  const rGain = 1 + wb * 0.18;   // varmt stik koeles ved at daempe roed
  const bGain = 1 - wb * 0.18;   // og loefte blaa
  const satGain = 1 + sa;
  const px = image.bitmap;

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] * expGain * rGain;
    let g = px[i + 1] * expGain;
    let b = px[i + 2] * expGain * bGain;

    if (ct) {
      r = (r - 128) * ctGain + 128;
      g = (g - 128) * ctGain + 128;
      b = (b - 128) * ctGain + 128;
    }
    if (sa) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * satGain;
      g = lum + (g - lum) * satGain;
      b = lum + (b - lum) * satGain;
    }
    px[i] = clamp255(r);
    px[i + 1] = clamp255(g);
    px[i + 2] = clamp255(b);
  }
}

/**
 * Let unsharp mask. Nedskalering bloeder altid kanterne op, og et
 * marketplace-foto skal se skarpt ud i en lille thumbnail.
 */
function sharpen(image: { bitmap: Uint8ClampedArray; width: number; height: number }, amount = 0.45): void {
  const { width: w, height: h } = image;
  if (w < 3 || h < 3) return;
  const src = new Uint8ClampedArray(image.bitmap);
  const px = image.bitmap;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const centre = src[i + c];
        const blur = (
          src[i - w * 4 + c] + src[i + w * 4 + c] +
          src[i - 4 + c] + src[i + 4 + c] +
          centre * 4
        ) / 8;
        px[i + c] = clamp255(centre + (centre - blur) * amount * 2);
      }
    }
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Drejer en normaliseret kasse med uret, saa den foelger billedet rundt. */
function rotateBox(
  b: { x0: number; y0: number; x1: number; y1: number },
  degreesClockwise: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const moved = pts.map(function ([x, y]) {
    if (degreesClockwise === 90) return [1 - y, x];
    if (degreesClockwise === 180) return [1 - x, 1 - y];
    if (degreesClockwise === 270) return [y, 1 - x];
    return [x, y];
  });
  const xs = moved.map((p) => p[0]);
  const ys = moved.map((p) => p[1]);
  return {
    x0: Math.min(...xs), y0: Math.min(...ys),
    x1: Math.max(...xs), y1: Math.max(...ys),
  };
}

/**
 * Rotates, then expands the item's box to Vinted's 4:5 without ever cutting
 * into the item itself, and caps the long edge.
 */
// Baggrundens egen farve, aflaest i billedets fire hjoerner.
//
// Hjoernerne er valgt med vilje. Beskaeringen er stram om varen, saa varen
// roerer alle fire KANTER - men en vares omrids fylder aldrig sit eget
// hjoerne. Der er altid underlag. Gennemsnittet af de fire er derfor
// baggrunden, ogsaa naar varen fylder det meste af rammen.
//
// Et fladt felt, ikke en udstraekning af kantraekken: en udstraekning ville
// traekke varens egen oeverste pixelraekke opad i striber, netop fordi den
// stramme beskaering lader varen roere kanten.
function kantFarve(img: { bitmap: Uint8ClampedArray; width: number; height: number }): number {
  const { bitmap: px, width: W, height: H } = img;
  const n = Math.max(4, Math.round(Math.min(W, H) * 0.06));
  let r = 0, g = 0, b = 0, c = 0;
  const hjoerner: Array<[number, number]> = [[0, 0], [W - n, 0], [0, H - n], [W - n, H - n]];
  for (const [ox, oy] of hjoerner) {
    for (let y = oy; y < oy + n; y++) {
      for (let x = ox; x < ox + n; x++) {
        const i = (y * W + x) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; c++;
      }
    }
  }
  if (!c) return Image.rgbaToColor(255, 255, 255, 255);
  return Image.rgbaToColor(Math.round(r / c), Math.round(g / c), Math.round(b / c), 255);
}

export async function optimizePhoto(
  buf: ArrayBuffer,
  guidance: PhotoGuidance,
  preview = false,
): Promise<Uint8Array> {
  let image = await Image.decode(new Uint8Array(buf));

  // Maskering sker på originalen, før rotation og beskæring, så modellens
  // koordinater passer uden at skulle regnes om.
  if (!preview && guidance.mask && guidance.mask.length) {
    maskRegions(
      image as unknown as { bitmap: Uint8ClampedArray; width: number; height: number },
      guidance.mask,
      guidance.protect || [],
    );
  }

  const rot = ((guidance.rotationDegrees % 360) + 360) % 360;
  let box = {
    x0: Math.min(guidance.crop.x0, guidance.crop.x1),
    y0: Math.min(guidance.crop.y0, guidance.crop.y1),
    x1: Math.max(guidance.crop.x0, guidance.crop.x1),
    y1: Math.max(guidance.crop.y0, guidance.crop.y1),
  };
  if (rot === 90 || rot === 180 || rot === 270) {
    // ImageScript drejer MOD uret; modellen svarer i grader MED uret.
    image = image.rotate((360 - rot) % 360);
    // Rammen er sat i det oprindelige billede, saa den skal med rundt - ellers
    // beskaeres der et helt andet sted, end modellen pegede paa.
    box = rotateBox(box, rot);
  }

  const W = image.width;
  const H = image.height;

  // Luften om motivet. Men skal billedet ISOLERES, leverer den hvide ramme
  // allerede luften - laegger beskaeringen ogsaa sin egen til, faar man begge
  // dele: en bræmme af sengetoej klemt inde mellem varen og det hvide. Det
  // laeser som en fejl, ikke som et produktfoto. Saa naar vi isolerer,
  // beskaeres der taet, og det hvide staar for resten.
  // HELE varer isoleres altid. Hovedbillederne er dem, der skal ligne
  // produktfotos i gitteret, og en hel vare har ingen gavn af den flade, den
  // ligger paa - et gulv, et sengetaeppe, et bord er stoej uanset hvor paent
  // det er. Naerbilleder beholder deres omgivelser: stoffet omkring et maerkat
  // er en del af det, koeberen skal kunne se.
  // KUN hele varer isoleres. Et naerbillede maa aldrig beskaeres stramt: dér er
  // stoffet omkring maerkatet ikke rod, men sammenhaengen - og et maerkat, der
  // roerer kanten, mister den sidste linje tekst. Da isoleringen ogsaa gjaldt
  // naerbilleder, blev vaskemaerkatets hoejre kant klippet af.
  const vilIsolere = guidance.subject === "helvare";
  const pad = guidance.subjectCutOff
    ? PADDING_CUT_OFF
    : vilIsolere
    ? PADDING_ISOLERET
    : (PADDING[guidance.subject || ""] ?? PADDING_DEFAULT);

  // Item box in pixels, padded.
  let x0 = clamp01(box.x0 - pad) * W;
  let y0 = clamp01(box.y0 - pad) * H;
  let x1 = clamp01(box.x1 + pad) * W;
  let y1 = clamp01(box.y1 + pad) * H;

  if (!(x1 > x0) || !(y1 > y0)) {
    x0 = 0; y0 = 0; x1 = W; y1 = H;
  }

  let cw = x1 - x0;
  let ch = y1 - y0;

  // Pick the allowed ratio closest to the item's own shape, then grow (never
  // shrink) into it, so nothing of the item is lost and no side fills up with
  // background.
  // Formatet laegger sig saa taet paa motivets egen facon, som baandet
  // tillader. Det er dét, der goer varen saa stor som muligt: hver grad, vi
  // tvinger formatet vaek fra varens facon, er en bræmme ramme, der skal
  // fyldes - og en vare, der bliver mindre i gitteret.
  //
  // Foer blev hele varer altid tvunget til 3:4 for at staa ens i gitteret. Med
  // en bred cardigan kostede det to tredjedele af rammen i tom ramme. Ens
  // format er ikke mere vaerd end en vare, man kan se.
  const target = Math.max(RATIO_MIN, Math.min(RATIO_MAX, cw / ch));
  // For at ramme formatet skal rammen VOKSE - og den vokser ud i det, der
  // ligger rundt om varen. Er det et rent gulv, er det fint. Er det
  // fotografens fodder, en sengekant eller et andet moebel, er det praecis
  // dét, beskaeringen skulle af med, og saa goer vi ondt vaerre ved at goere
  // rammen stoerre.
  //
  // Derfor to veje. Er baggrunden rolig, vokser rammen som foer. Er der rod
  // taet paa - eller kan formatet slet ikke naas inden for billedet - saa
  // beskaeres der STRAMT om varen, og resten fyldes ud med hvidt bagefter.
  // Varen staar da isoleret paa hvid bund, som paa et produktfoto, og
  // formatet er alligevel praecist.
  const voksetW = cw / ch > target ? cw : ch * target;
  const voksetH = cw / ch > target ? cw / target : ch;
  const passerIkke = voksetW > W || voksetH > H;
  const isoler = vilIsolere || passerIkke;

  if (!isoler) {
    cw = voksetW;
    ch = voksetH;
  }

  // Hold rammen inden for billedet. Ved isolering er den allerede stram om
  // varen, saa her sker der intet.
  if (cw > W) { ch = ch * (W / cw); cw = W; }
  if (ch > H) { cw = cw * (H / ch); ch = H; }

  let cx = (x0 + x1) / 2 - cw / 2;
  let cy = (y0 + y1) / 2 - ch / 2;
  cx = Math.max(0, Math.min(W - cw, cx));
  cy = Math.max(0, Math.min(H - ch, cy));

  image = image.crop(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));

  // Rammen, der bringer billedet op i format. Laegges kun naar der blev
  // beskaaret stramt - ellers har billedet allerede formatet.
  if (isoler) {
    let tw = image.width;
    let th = image.height;
    if (tw / th > target) th = Math.round(tw / target);
    else tw = Math.round(th * target);
    if (tw > image.width || th > image.height) {
      const bund = new Image(tw, th);
      bund.fill(guidance.padStyle === "kant"
        ? kantFarve(image as unknown as { bitmap: Uint8ClampedArray; width: number; height: number })
        : Image.rgbaToColor(255, 255, 255, 255));
      bund.composite(image, Math.round((tw - image.width) / 2), Math.round((th - image.height) / 2));
      image = bund;
    }
  }

  // Kontrolbilledet skal kun bedoemmes af et oeje, ikke ses af en koeber. Det
  // laves lille og springer alt det dyre over: maskering, fremkaldelse og
  // skarphed. Det var netop dem, ganget med tre gennemloeb pr. foto, der
  // sprang Supabases CPU-graense.
  const maxEdge = preview ? 560 : MAX_EDGE;
  const longEdge = Math.max(image.width, image.height);
  if (longEdge > maxEdge) {
    const scale = maxEdge / longEdge;
    image = image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
  }

  // Målingen først, skønnet bagefter. Modellen så det URETTEDE billede, så
  // dens tal ville rette anden gang for det, autoTone allerede har rettet -
  // derfor kun en brøkdel af dem: et nap, ikke en ny fremkaldelse.
  if (preview) return await image.encodeJPEG(60);

  const used = autoTone(image as unknown as { bitmap: Uint8ClampedArray }, guidance.tone);
  if (guidance.toneOut && used) guidance.toneOut.tone = used;
  if (guidance.look) {
    const nudge = 0.35;
    applyLook(image as unknown as { bitmap: Uint8ClampedArray }, {
      exposure: (guidance.look.exposure ?? 0) * nudge,
      contrast: (guidance.look.contrast ?? 0) * nudge,
      warmth: (guidance.look.warmth ?? 0) * nudge,
      // Mætningen er det eneste, modellen ser bedre end histogrammet: om varen
      // ser livløs eller skrigende ud. Den får lov at tælle mere.
      saturation: (guidance.look.saturation ?? 0) * 0.7,
    });
  }
  sharpen(image as unknown as { bitmap: Uint8ClampedArray; width: number; height: number });

  // 88, ikke 92: Vinted koder alligevel om til deres egne stoerrelser, saa de
  // sidste par procent bliver kastet vaek. Til gengaeld skal filen hentes ned
  // og lægges op igen fra telefonen, og dér taeller hver kilobyte.
  // Vinteds egne filer i denne stoerrelse vejer 220-690 kB; vi lander under.
  return await image.encodeJPEG(88);
}
