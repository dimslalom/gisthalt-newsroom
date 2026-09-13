import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Brand } from './types.ts';

/**
 * The brand's *saved* identity — as opposed to paint.ts's per-layer literal
 * colours, which win for one node in one document. This is the other end of
 * the same open-vs-closed idea: a brand's own palette and type stack used to
 * be a code change (tokens.ts / skins.ts) before anyone could see the result.
 * Now a designer can pick a replacement in the editor and it's live for every
 * layout immediately — but it's still config-as-code, same as tokens.ts and
 * layout-overrides.json: one JSON file per brand, versioned, diffable,
 * reviewable in a PR. What tokens.ts still owns: type scale, spacing, the
 * logo lockup, and anything this file's keys don't mention.
 */

export type SkinColourRole = 'bg' | 'panel' | 'fg' | 'muted' | 'line' | 'fallbackAccent';
export const SKIN_COLOUR_ROLES: SkinColourRole[] = ['bg', 'panel', 'fg', 'muted', 'line', 'fallbackAccent'];
export type FontSlot = 'display' | 'body' | 'mono';
export const FONT_SLOTS: FontSlot[] = ['display', 'body', 'mono'];

export interface ThemeFontOverride {
  /** The bare family name, e.g. "Poppins" — not a full CSS stack. */
  family: string;
  /** True once fetchGoogleFont has pinned real woff2 bytes for it on disk. */
  google?: boolean;
}

/** tokens.ts's `ls.disp` / `ls.lab` — display/headline tracking and
 *  label/eyebrow tracking. Stored normalised to an em string ("-0.03em"). */
export type LetterSpacingSlot = 'disp' | 'lab';
export const LETTER_SPACING_SLOTS: LetterSpacingSlot[] = ['disp', 'lab'];

export interface ThemeOverride {
  /** skin key -> the subset of its colour roles this brand has replaced. */
  skins?: Record<string, Partial<Record<SkinColourRole, string>>>;
  fonts?: Partial<Record<FontSlot, ThemeFontOverride>>;
  letterSpacing?: Partial<Record<LetterSpacingSlot, string>>;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function pathFor(brandKey: string): string {
  return resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'theme-override.json');
}

const cache = new Map<string, ThemeOverride>();

export function loadThemeOverride(brandKey: string, path = pathFor(brandKey)): ThemeOverride {
  const cached = cache.get(path);
  if (cached) return cached;
  let file: ThemeOverride = {};
  if (existsSync(path)) {
    // A corrupt override file degrades to "no overrides", never a crashed render.
    try { file = JSON.parse(readFileSync(path, 'utf8')) as ThemeOverride; } catch { file = {}; }
  }
  cache.set(path, file);
  return file;
}

export function resetThemeOverrideCache(): void { cache.clear(); }

function sanitiseHex(v: unknown): string | undefined {
  return typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : undefined;
}

function sanitiseFontOverride(v: unknown): ThemeFontOverride | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.family !== 'string' || !o.family.trim()) return undefined;
  return { family: o.family.trim().slice(0, 80), google: Boolean(o.google) };
}

/** Accepts however a designer is likely to type tracking — a bare number or
 *  a "%" suffix means percent (the everyday unit: "-3" / "-3%"), an "em"
 *  suffix is taken literally. Always normalised to an em string, since
 *  that's what the CSS custom property (--ls-disp / --ls-lab) expects. */
function sanitiseLetterSpacing(v: unknown): string | undefined {
  if (typeof v !== 'number' && typeof v !== 'string') return undefined;
  const m = String(v).trim().match(/^(-?\d+(?:\.\d+)?)\s*(%|em)?$/);
  if (!m) return undefined;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return undefined;
  const em = m[2] === 'em' ? num : num / 100;
  return `${Math.min(0.5, Math.max(-0.5, em))}em`;
}

/** Never trust a number — or a string — straight from a UI. Bad input drops
 *  the field rather than rejecting the whole save. */
export function sanitiseThemeOverride(input: Partial<ThemeOverride>): ThemeOverride {
  const out: ThemeOverride = {};
  if (input.skins && typeof input.skins === 'object') {
    const skins: NonNullable<ThemeOverride['skins']> = {};
    for (const [key, patch] of Object.entries(input.skins)) {
      if (!patch || typeof patch !== 'object') continue;
      const clean: Partial<Record<SkinColourRole, string>> = {};
      for (const role of SKIN_COLOUR_ROLES) {
        const hex = sanitiseHex((patch as Record<string, unknown>)[role]);
        if (hex) clean[role] = hex;
      }
      if (Object.keys(clean).length) skins[key] = clean;
    }
    if (Object.keys(skins).length) out.skins = skins;
  }
  if (input.fonts && typeof input.fonts === 'object') {
    const fonts: NonNullable<ThemeOverride['fonts']> = {};
    for (const slot of FONT_SLOTS) {
      const f = sanitiseFontOverride((input.fonts as Record<string, unknown>)[slot]);
      if (f) fonts[slot] = f;
    }
    if (Object.keys(fonts).length) out.fonts = fonts;
  }
  if (input.letterSpacing && typeof input.letterSpacing === 'object') {
    const ls: NonNullable<ThemeOverride['letterSpacing']> = {};
    for (const slot of LETTER_SPACING_SLOTS) {
      const v = sanitiseLetterSpacing((input.letterSpacing as Record<string, unknown>)[slot]);
      if (v) ls[slot] = v;
    }
    if (Object.keys(ls).length) out.letterSpacing = ls;
  }
  return out;
}

/** Merges `patch` into whatever this brand already has saved — the same
 *  "read, merge, write" shape as saveLayoutOverride, so setting one colour
 *  role never clobbers a font pin saved a minute earlier. */
export function saveThemeOverride(brandKey: string, patch: Partial<ThemeOverride>): ThemeOverride {
  const path = pathFor(brandKey);
  const existing = loadThemeOverride(brandKey, path);
  const clean = sanitiseThemeOverride(patch);
  const merged: ThemeOverride = {
    skins: { ...existing.skins, ...Object.fromEntries(Object.entries(clean.skins ?? {}).map(([k, v]) => [k, { ...existing.skins?.[k], ...v }])) },
    fonts: { ...existing.fonts, ...clean.fonts },
    letterSpacing: { ...existing.letterSpacing, ...clean.letterSpacing },
  };
  if (!Object.keys(merged.skins!).length) delete merged.skins;
  if (!Object.keys(merged.fonts!).length) delete merged.fonts;
  if (!Object.keys(merged.letterSpacing!).length) delete merged.letterSpacing;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  cache.set(path, merged);
  return merged;
}

/** Drops one skin's colour role, one font slot, or one tracking slot back to
 *  the brand's coded default. All-undefined clears everything. */
export function clearThemeOverride(brandKey: string, target: { skin?: string; role?: SkinColourRole; font?: FontSlot; letterSpacing?: LetterSpacingSlot }): ThemeOverride {
  const path = pathFor(brandKey);
  const file = loadThemeOverride(brandKey, path);
  const next: ThemeOverride = { skins: { ...file.skins }, fonts: { ...file.fonts }, letterSpacing: { ...file.letterSpacing } };
  if (target.letterSpacing) {
    delete next.letterSpacing![target.letterSpacing];
  } else if (target.font) {
    delete next.fonts![target.font];
  } else if (target.skin) {
    if (target.role) {
      const skin = { ...next.skins![target.skin] };
      delete skin[target.role];
      if (Object.keys(skin).length) next.skins![target.skin] = skin; else delete next.skins![target.skin];
    } else {
      delete next.skins![target.skin];
    }
  } else {
    delete next.skins; delete next.fonts; delete next.letterSpacing;
  }
  if (next.skins && !Object.keys(next.skins).length) delete next.skins;
  if (next.fonts && !Object.keys(next.fonts).length) delete next.fonts;
  if (next.letterSpacing && !Object.keys(next.letterSpacing).length) delete next.letterSpacing;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  cache.set(path, next);
  return next;
}

/** A brand token's fallback stack keeps the CJK fonts fontsCss() layers in
 *  dynamically — only the leading family the designer controls changes. */
function fontFamilyCss(family: string): string {
  return `'${family.replace(/'/g, '')}', 'NotoSansJP', 'NotoSansKR', sans-serif`;
}

/** Applies a brand's saved override onto its coded defaults. tokens.ts and
 *  skins.ts stay the source of truth for anything the override doesn't name;
 *  this never mutates the imported Brand object, it returns a patched copy. */
export function applyThemeOverride(brand: Brand): Brand {
  const override = loadThemeOverride(brand.key);
  if (!override.skins && !override.fonts && !override.letterSpacing) return brand;
  return {
    ...brand,
    tokens: override.fonts || override.letterSpacing ? {
      ...brand.tokens,
      fonts: override.fonts ? {
        display: override.fonts.display ? fontFamilyCss(override.fonts.display.family) : brand.tokens.fonts.display,
        body: override.fonts.body ? fontFamilyCss(override.fonts.body.family) : brand.tokens.fonts.body,
        mono: override.fonts.mono ? fontFamilyCss(override.fonts.mono.family) : brand.tokens.fonts.mono,
      } : brand.tokens.fonts,
      ls: override.letterSpacing ? {
        disp: override.letterSpacing.disp ?? brand.tokens.ls.disp,
        lab: override.letterSpacing.lab ?? brand.tokens.ls.lab,
      } : brand.tokens.ls,
    } : brand.tokens,
    skins: override.skins
      ? brand.skins.map((s) => (override.skins![s.key] ? { ...s, ...override.skins![s.key] } : s))
      : brand.skins,
  };
}
