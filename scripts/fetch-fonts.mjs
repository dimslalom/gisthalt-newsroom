/**
 * Pins the typefaces as base64 woff2 data URIs in packages/render/assets/fonts.css.
 * Run at image build time. Never at render time: a network blip must not change
 * your typography, and Windows/Linux rasterisation differences are hard enough
 * without a moving font file underneath them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const WANT = [
  ['Saira Condensed', [400, 600, 700]],
  ['IBM Plex Sans', [400, 500, 600]],
  ['IBM Plex Mono', [400, 500]],
];
const OUT = resolve('packages/render/assets/fonts.css');

const faces = [];
for (const [family, weights] of WANT) {
  for (const weight of weights) {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`;
    const css = await (await fetch(cssUrl, { headers: { 'user-agent': UA } })).text();
    const blocks = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
    // The latin subset carries the diacritics the fixture library tests for.
    const pick = blocks.find((b) => b.includes('U+0000-00FF')) ?? blocks.at(-1);
    const url = pick?.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
    if (!url) { console.warn(`no woff2 for ${family} ${weight}`); continue; }
    const buf = Buffer.from(await (await fetch(url, { headers: { 'user-agent': UA } })).arrayBuffer());
    faces.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`);
    console.log(`pinned ${family} ${weight} (${(buf.length / 1024).toFixed(1)}kB)`);
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, faces.join('\n'));
console.log(`wrote ${OUT} (${faces.length} faces)`);
