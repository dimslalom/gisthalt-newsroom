import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../assets/fonts.css');

let cache: string | null = null;

/**
 * Fonts are pinned: embedded woff2 as base64 data URIs, written at build time
 * by scripts/fetch-fonts.mjs. Never fetched at render time — a network blip
 * must not change your typography.
 */
function baseFontsCss(): string {
  if (cache !== null) return cache;
  if (!existsSync(ASSET)) {
    console.warn(JSON.stringify({
      lvl: 'warn', stage: 'render',
      msg: 'fonts.css missing — renders will use system fallbacks and will NOT match the container. Run: pnpm fonts',
    }));
    cache = '';
    return cache;
  }
  cache = readFileSync(ASSET, 'utf8');
  return cache;
}

export const fontsPinned = (): boolean => existsSync(ASSET);

/** A brand's own Google-Font pins (see google-fonts.ts), separate from the
 *  built-in placeholder/SektorTiga stack above — fetched on demand when a
 *  designer picks a font, cached here the same way, and invalidated the
 *  moment a fresh fetch overwrites the file on disk. */
const brandCache = new Map<string, string>();
function brandFontsCss(brandKey?: string): string {
  if (!brandKey) return '';
  const cached = brandCache.get(brandKey);
  if (cached !== undefined) return cached;
  const path = resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'fonts', 'pinned.css');
  const css = existsSync(path) ? readFileSync(path, 'utf8') : '';
  brandCache.set(brandKey, css);
  return css;
}
export function invalidateBrandFontsCache(brandKey: string): void { brandCache.delete(brandKey); }

const cjk = new Map<string,string>();
export function fontsCss(text = '', brandKey?: string): string {
  let css = baseFontsCss() + brandFontsCss(brandKey);
  for (const [name, pattern] of [['NotoSansJP', /[\u3040-\u30ff\u3400-\u9fff]/], ['NotoSansKR', /[\uac00-\ud7af\u1100-\u11ff]/]] as const) {
    if (!pattern.test(text)) continue;
    if (!cjk.has(name)) {
      const path = resolve(here, `../assets/${name}.ttf`);
      if (!existsSync(path)) throw new Error(`missing pinned ${name}; run node scripts/fetch-cjk-fonts.mjs`);
      cjk.set(name, `@font-face{font-family:'${name}';font-weight:100 900;font-display:block;src:url(data:font/ttf;base64,${readFileSync(path).toString('base64')}) format('truetype');}`);
    }
    css += cjk.get(name);
  }
  return css;
}
