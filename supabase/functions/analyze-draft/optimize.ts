// AI-styret billedoptimering: en vision-model finder rotation og hvor varen
// faktisk er i billedet, og vi beskærer efter dét i stedet for blindt at tage
// midten (som kan skære tøjet over). Fejler noget her, beholder vi originalen
// — et dårligt beskåret billede er bedre end intet udkast.

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

export interface PhotoGuidance {
  rotationDegrees: number;
  crop: { x0: number; y0: number; x1: number; y1: number };
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
    },
    required: ["rotationDegrees", "x0", "y0", "x1", "y1", "personalInfo"],
  },
};

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

  return await image.encodeJPEG(90);
}
