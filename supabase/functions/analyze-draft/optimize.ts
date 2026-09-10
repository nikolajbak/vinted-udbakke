// AI-styret billedoptimering: en vision-model finder rotation og hvor varen
// faktisk er i billedet, og vi beskærer efter dét i stedet for blindt at tage
// midten (som kan skære tøjet over). Fejler noget her, beholder vi originalen
// — et dårligt beskåret billede er bedre end intet udkast.

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

export interface PhotoGuidance {
  rotationDegrees: number;
  crop: { x0: number; y0: number; x1: number; y1: number };
  look?: { exposure?: number; contrast?: number; warmth?: number; saturation?: number };
  mask?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
}

// Vinted viser annoncebilleder i portræt, men at tvinge 4:5 ned over en bred
// vare (en jakke med ærmerne ud) fylder rammen med gulv. Vi tillader derfor
// alt mellem kvadratisk og 4:5 og vælger det, der ligger tættest på varens
// egen facon.
const RATIO_MAX = 1;       // kvadratisk
const RATIO_MIN = 4 / 5;   // Vinteds portrætformat
const MAX_EDGE = 1600;
const PADDING = 0.06; // luft omkring varen, så den ikke klistrer til kanten

export const GUIDANCE_TOOL = {
  name: "vurder_billede",
  description:
    "Angiv hvordan dette ene billede skal roteres og beskæres, så varen står bedst i en Vinted-annonce.",
  input_schema: {
    type: "object",
    properties: {
      rotationDegrees: {
        type: "integer",
        description: "0, 90, 180 eller 270 — hvor meget billedet skal roteres med uret for at vende rigtigt",
      },
      x0: { type: "number", description: "Venstre kant af motivet, 0-1 af bredden" },
      y0: { type: "number", description: "Øverste kant af motivet, 0-1 af højden" },
      x1: { type: "number", description: "Højre kant af motivet, 0-1" },
      y1: { type: "number", description: "Nederste kant af motivet, 0-1" },
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
      "rotationDegrees", "x0", "y0", "x1", "y1", "personalRegions",
      "exposure", "contrast", "warmth", "saturation",
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
): void {
  const { width: W, height: H } = image;
  const px = image.bitmap;
  const PAD = 0.012; // lidt luft, så kanten af teksten ikke bliver stående

  for (const r of regions) {
    const x0 = Math.max(0, Math.floor((Math.min(r.x0, r.x1) - PAD) * W));
    const y0 = Math.max(0, Math.floor((Math.min(r.y0, r.y1) - PAD) * H));
    const x1 = Math.min(W, Math.ceil((Math.max(r.x0, r.x1) + PAD) * W));
    const y1 = Math.min(H, Math.ceil((Math.max(r.y0, r.y1) + PAD) * H));
    if (x1 <= x0 || y1 <= y0) continue;

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
            const i = (y * W + x) * 4;
            px[i] = ar; px[i+1] = ag; px[i+2] = ab;
          }
        }
      }
    }
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

/**
 * Rotates, then expands the item's box to Vinted's 4:5 without ever cutting
 * into the item itself, and caps the long edge.
 */
export async function optimizePhoto(
  buf: ArrayBuffer,
  guidance: PhotoGuidance,
): Promise<Uint8Array> {
  let image = await Image.decode(new Uint8Array(buf));

  // Maskering sker på originalen, før rotation og beskæring, så modellens
  // koordinater passer uden at skulle regnes om.
  if (guidance.mask && guidance.mask.length) {
    maskRegions(image as unknown as { bitmap: Uint8ClampedArray; width: number; height: number }, guidance.mask);
  }

  const rot = ((guidance.rotationDegrees % 360) + 360) % 360;
  if (rot === 90 || rot === 180 || rot === 270) {
    image = image.rotate(rot);
  }

  const W = image.width;
  const H = image.height;

  // Item box in pixels, padded.
  let x0 = clamp01(guidance.crop.x0 - PADDING) * W;
  let y0 = clamp01(guidance.crop.y0 - PADDING) * H;
  let x1 = clamp01(guidance.crop.x1 + PADDING) * W;
  let y1 = clamp01(guidance.crop.y1 + PADDING) * H;

  if (!(x1 > x0) || !(y1 > y0)) {
    x0 = 0; y0 = 0; x1 = W; y1 = H;
  }

  let cw = x1 - x0;
  let ch = y1 - y0;

  // Pick the allowed ratio closest to the item's own shape, then grow (never
  // shrink) into it, so nothing of the item is lost and no side fills up with
  // background.
  const target = Math.max(RATIO_MIN, Math.min(RATIO_MAX, cw / ch));
  if (cw / ch > target) {
    ch = cw / target;
  } else {
    cw = ch * target;
  }

  // Keep it inside the image, shrinking only if the frame simply isn't big enough.
  if (cw > W) { ch = ch * (W / cw); cw = W; }
  if (ch > H) { cw = cw * (H / ch); ch = H; }

  let cx = (x0 + x1) / 2 - cw / 2;
  let cy = (y0 + y1) / 2 - ch / 2;
  cx = Math.max(0, Math.min(W - cw, cx));
  cy = Math.max(0, Math.min(H - ch, cy));

  image = image.crop(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));

  const longEdge = Math.max(image.width, image.height);
  if (longEdge > MAX_EDGE) {
    const scale = MAX_EDGE / longEdge;
    image = image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
  }

  if (guidance.look) applyLook(image as unknown as { bitmap: Uint8ClampedArray }, guidance.look);
  sharpen(image as unknown as { bitmap: Uint8ClampedArray; width: number; height: number });

  return await image.encodeJPEG(90);
}
