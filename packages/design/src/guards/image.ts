import { onColourFor } from './contrast.ts';

export interface Region { left: number; top: number; width: number; height: number }

export interface TextTreatment {
  /** 0-1 scrim opacity to lay between the image and the text. */
  scrim: number;
  colour: string;
  /** False when no scrim can rescue it: the layout must move text to a solid panel. */
  overImage: boolean;
  stats: { mean: number; stdDev: number };
}

/**
 * Pure half of pickTextTreatment, so the decision is testable without an image.
 * mean and stdDev are 0-255 over the region the text will occupy.
 */
export function treatmentFromStats(mean: number, stdDev: number, light = '#F2F5F6', dark = '#0A0C0E'): TextTreatment {
  // High variance means no single scrim opacity works across the region.
  if (stdDev > 68) return { scrim: 0, colour: light, overImage: false, stats: { mean, stdDev } };
  const dense = stdDev > 40 ? 0.2 : 0;
  if (mean < 90) return { scrim: Math.min(0.55, 0.15 + dense), colour: light, overImage: true, stats: { mean, stdDev } };
  if (mean > 165) return { scrim: Math.min(0.55, 0.15 + dense), colour: dark, overImage: true, stats: { mean, stdDev } };
  // Mid-grey is the hard case: darken hard and go light.
  return { scrim: 0.5 + dense, colour: light, overImage: true, stats: { mean, stdDev } };
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
/** Fixed tie-break order, so placement stays consistent across a series
 *  rather than jumping around between posts. */
export const CORNER_ORDER: Corner[] = ['br', 'bl', 'tr', 'tl'];

/** Pure half of pickLogoCorner. Scores are edge density, lowest wins. */
export function cornerFromScores(scores: Record<Corner, number>, busyThreshold = 26): Corner | 'strip' {
  const ranked = CORNER_ORDER.map((c) => ({ c, s: scores[c] })).sort((a, b) => a.s - b.s || CORNER_ORDER.indexOf(a.c) - CORNER_ORDER.indexOf(b.c));
  const best = ranked[0]!;
  if (best.s > busyThreshold) return 'strip';
  return best.c;
}

type SharpModule = typeof import('sharp');
let sharpMod: SharpModule | null | undefined;

async function loadSharp(): Promise<SharpModule | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import('sharp')).default as unknown as SharpModule;
  } catch {
    sharpMod = null; // Guards degrade to their safe defaults rather than failing the render.
  }
  return sharpMod;
}

/** Samples mean luminance and standard deviation of the image region under the text. */
export async function pickTextTreatment(imagePath: string, region: Region): Promise<TextTreatment> {
  const sharp = await loadSharp();
  if (!sharp) return treatmentFromStats(40, 20);
  try {
    const buf = await sharp(imagePath)
      .extract({ left: Math.round(region.left), top: Math.round(region.top), width: Math.round(region.width), height: Math.round(region.height) })
      .greyscale()
      .raw()
      .toBuffer();
    const n = buf.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += buf[i]!;
    const mean = sum / n;
    let varsum = 0;
    for (let i = 0; i < n; i++) varsum += (buf[i]! - mean) ** 2;
    return treatmentFromStats(mean, Math.sqrt(varsum / n));
  } catch {
    return treatmentFromStats(40, 20);
  }
}

/** Scores edge density in each of the four corners; lowest wins. */
export async function pickLogoCorner(imagePath: string, boxFraction = 0.28): Promise<Corner | 'strip'> {
  const sharp = await loadSharp();
  if (!sharp) return 'br';
  try {
    const img = sharp(imagePath).greyscale();
    const meta = await img.metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return 'br';
    const bw = Math.max(8, Math.floor(W * boxFraction));
    const bh = Math.max(8, Math.floor(H * boxFraction));
    const boxes: Record<Corner, { left: number; top: number }> = {
      tl: { left: 0, top: 0 },
      tr: { left: W - bw, top: 0 },
      bl: { left: 0, top: H - bh },
      br: { left: W - bw, top: H - bh },
    };
    const scores = {} as Record<Corner, number>;
    for (const c of CORNER_ORDER) {
      const { left, top } = boxes[c];
      const buf = await sharp(imagePath).greyscale()
        .extract({ left, top, width: bw, height: bh })
        .raw().toBuffer();
      // Mean absolute horizontal gradient: cheap, deterministic edge density.
      let acc = 0;
      for (let i = 1; i < buf.length; i++) acc += Math.abs(buf[i]! - buf[i - 1]!);
      scores[c] = acc / (buf.length - 1);
    }
    return cornerFromScores(scores);
  } catch {
    return 'br';
  }
}
