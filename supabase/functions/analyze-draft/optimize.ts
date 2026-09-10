// AI-styret billedoptimering: en vision-model finder rotation og hvor varen
// faktisk er i billedet, og vi beskærer efter dét i stedet for blindt at tage
// midten (som kan skære tøjet over). Fejler noget her, beholder vi originalen
// — et dårligt beskåret billede er bedre end intet udkast.

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

export interface PhotoGuidance {
  rotationDegrees: number;
  crop: { x0: number; y0: number; x1: number; y1: number };
  look?: { exposure?: number; contrast?: number; warmth?: number; saturation?: number };
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
      personalInfo: {
        type: "boolean",
        description: "true hvis billedet viser navn, adresse eller andet personligt, fx et navnemærke i tøjet",
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
      "rotationDegrees", "x0", "y0", "x1", "y1", "personalInfo",
      "exposure", "contrast", "warmth", "saturation",
    ],
  },
};


const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

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
