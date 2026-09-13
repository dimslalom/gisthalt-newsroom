import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

function pinnedPathFor(brandKey: string): string {
  return resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'fonts', 'pinned.css');
}

/**
 * Fetches one Google Font family's Latin faces and pins them as base64 woff2
 * data URIs into the brand's own fonts/pinned.css — the same "never at render
 * time" rule scripts/fetch-fonts.mjs already follows for the built-in type
 * stack (see fonts.ts): a network blip must not change what a scheduled post
 * looks like. This just runs that fetch once, on demand, when a designer
 * picks a brand font in the editor, instead of at image-build time.
 */
export async function fetchGoogleFont(brandKey: string, family: string, weights: number[] = [400, 500, 600, 700]): Promise<{ family: string; weights: number[] }> {
  const trimmed = family.trim();
  if (!trimmed) throw new Error('font family is required');

  const path = pinnedPathFor(brandKey);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  // Drop any faces already pinned for this exact family so re-fetching (a
  // different weight set, or just refreshing) doesn't grow the file forever.
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = existing.replace(new RegExp(`@font-face\\{font-family:'${escaped}'[^}]*\\}`, 'g'), '').trim();

  const faces: string[] = [];
  const got: number[] = [];
  for (const weight of weights) {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(trimmed).replace(/%20/g, '+')}:wght@${weight}&display=swap`;
    const cssRes = await fetch(cssUrl, { headers: { 'user-agent': UA } });
    if (!cssRes.ok) continue;
    const css = await cssRes.text();
    const blocks = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]!);
    // The latin subset carries the diacritics the fixture library tests for.
    const pick = blocks.find((b) => b.includes('U+0000-00FF')) ?? blocks.at(-1);
    const url = pick?.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
    if (!url) continue;
    const fontRes = await fetch(url, { headers: { 'user-agent': UA } });
    if (!fontRes.ok) continue;
    const buf = Buffer.from(await fontRes.arrayBuffer());
    faces.push(`@font-face{font-family:'${trimmed}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`);
    got.push(weight);
  }
  if (!faces.length) throw new Error(`could not find a Google Font named "${trimmed}"`);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${[stripped, ...faces].filter(Boolean).join('\n')}\n`);
  return { family: trimmed, weights: got };
}
