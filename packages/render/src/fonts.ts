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

const cjk = new Map<string,string>();
export function fontsCss(text = ''): string {
  let css = baseFontsCss();
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
