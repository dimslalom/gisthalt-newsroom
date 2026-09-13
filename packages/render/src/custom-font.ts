import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function pinnedPathFor(brandKey: string): string {
  return resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'fonts', 'pinned.css');
}

/** Sniffs the real format from the file's own magic bytes rather than
 *  trusting the upload's file extension — a mislabelled file would otherwise
 *  fail silently in the one browser (the render container's) that never
 *  shows a human an error. */
function detectFormat(buf: Buffer): { format: string; mime: string } {
  const sig = buf.subarray(0, 4).toString('latin1');
  if (sig === 'wOFF') return { format: 'woff', mime: 'font/woff' };
  if (sig === 'wOF2') return { format: 'woff2', mime: 'font/woff2' };
  if (sig === 'OTTO') return { format: 'opentype', mime: 'font/otf' };
  if (sig === '\x00\x01\x00\x00' || sig === 'true' || sig === 'ttcf') return { format: 'truetype', mime: 'font/ttf' };
  throw new Error('unrecognised font file — expected .ttf, .otf, .woff or .woff2');
}

/**
 * Pins a designer-uploaded font's raw bytes into the brand's own
 * fonts/pinned.css — the exact same file, and the exact same render-time
 * code path (fonts.ts's fontsCss), that fetchGoogleFont writes into. Where a
 * Google Font arrives over the network, this arrives from the editor's file
 * picker; either way, it's a one-time write, never re-read from anywhere but
 * that pinned CSS at render time.
 */
export function pinUploadedFont(brandKey: string, family: string, weight: number, bytes: Buffer): { family: string; weight: number } {
  const { format, mime } = detectFormat(bytes);
  const path = pinnedPathFor(brandKey);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const escapedFamily = family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace only this exact family+weight pair — uploading a second weight
  // for the same family adds a face instead of clobbering the first one.
  const stripped = existing
    .replace(new RegExp(`@font-face\\{font-family:'${escapedFamily}';font-style:normal;font-weight:${weight};[^}]*\\}`, 'g'), '')
    .trim();
  const face = `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:${mime};base64,${bytes.toString('base64')}) format('${format}');}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${[stripped, face].filter(Boolean).join('\n')}\n`);
  return { family, weight };
}
