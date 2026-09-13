import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The visual editor's save target. Layouts position content with CSS Grid/Flex
 * alignment and sized boxes, not literal x/y coordinates — free-form drag
 * would let a post-time override defeat the guards (fitText, contrast, logo
 * placement) that keep unattended publishing safe. So the adjustable surface
 * is deliberately this small, bounded set: the same knobs the layouts already
 * expose as CSS custom properties or fitText bounds, just made per-layout and
 * saveable instead of requiring a code change for every nudge.
 */
/**
 * A per-element nudge: translate + uniform scale from a named element's own
 * Grid/Flex-computed position, applied as a CSS transform (transform-origin
 * top left, so the element's natural top-left corner is what stays anchored
 * while a corner-drag grows or shrinks it). Content still flows and fits
 * normally underneath — the transform is a final compositing step layered on
 * top, exactly like moving a layer on a design canvas, not a layout change.
 */
export interface ElementTransform {
  x?: number;
  y?: number;
  scale?: number;
}

export interface LayoutOverride {
  /** Outer padding of the whole card. Token default varies by brand (~64px). */
  padding?: number;
  /** The base spacing unit every `gap` in the layout is a multiple of. */
  spacingUnit?: number;
  /** fitText's floor and ceiling for the headline, in px. */
  headlineMinPx?: number;
  headlineMaxPx?: number;
  /** Vertical anchor of the text block within its layout region. */
  bodyAlign?: 'start' | 'center' | 'end';
  /** Horizontal text alignment within the text block. */
  textAlign?: 'left' | 'center' | 'right';
  /** Named element (see ELEMENT_NAMES) -> its saved transform. */
  elements?: Record<string, ElementTransform>;
}

/** Every element the template tags with `data-el` and the editor can select.
 *  Not every layout renders every element for every claim — the editor only
 *  offers handles for what actually rendered this time. */
export const ELEMENT_NAMES = [
  'eyebrow', 'logo', 'headline', 'subhead', 'bignum', 'biglabel',
  'quote', 'attribution', 'rows', 'footnote', 'photo',
] as const;
export type ElementName = (typeof ELEMENT_NAMES)[number];

/** archetype -> layout -> the override for that pair. One file per brand. */
export type LayoutOverrideFile = Record<string, Record<string, LayoutOverride>>;

const BOUNDS = {
  padding: [16, 160],
  spacingUnit: [4, 32],
  headlineMinPx: [16, 200],
  headlineMaxPx: [24, 320],
} as const satisfies Record<string, readonly [number, number]>;

/** Half the canvas in each direction — generous, but a corrupt value can't
 *  place an element wildly off-frame. Scale 0.2-4x covers a genuine resize
 *  without letting a fat-fingered drag invert or erase an element. */
const ELEMENT_BOUNDS = { x: [-540, 540], y: [-675, 675], scale: [0.2, 4] } as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v));

function sanitizeElementTransform(input: Partial<ElementTransform>): ElementTransform {
  const out: ElementTransform = {};
  if (typeof input.x === 'number' && Number.isFinite(input.x)) out.x = Math.round(clamp(input.x, ELEMENT_BOUNDS.x));
  if (typeof input.y === 'number' && Number.isFinite(input.y)) out.y = Math.round(clamp(input.y, ELEMENT_BOUNDS.y));
  if (typeof input.scale === 'number' && Number.isFinite(input.scale)) out.scale = Math.round(clamp(input.scale, ELEMENT_BOUNDS.scale) * 100) / 100;
  return out;
}

/** Never trust a number straight from a UI. Out-of-range input is clamped, not rejected — a slider mis-drag shouldn't 500. */
export function sanitizeOverride(input: Partial<LayoutOverride>): LayoutOverride {
  const out: LayoutOverride = {};
  for (const key of ['padding', 'spacingUnit', 'headlineMinPx', 'headlineMaxPx'] as const) {
    const v = input[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp(v, BOUNDS[key]);
  }
  if (input.bodyAlign === 'start' || input.bodyAlign === 'center' || input.bodyAlign === 'end') out.bodyAlign = input.bodyAlign;
  if (input.textAlign === 'left' || input.textAlign === 'center' || input.textAlign === 'right') out.textAlign = input.textAlign;
  // A floor above the ceiling would make fitText's binary search fail closed on every render. Swap, don't ship it broken.
  if (out.headlineMinPx !== undefined && out.headlineMaxPx !== undefined && out.headlineMinPx > out.headlineMaxPx) {
    [out.headlineMinPx, out.headlineMaxPx] = [out.headlineMaxPx, out.headlineMinPx];
  }
  if (input.elements && typeof input.elements === 'object') {
    const elements: Record<string, ElementTransform> = {};
    for (const [name, tr] of Object.entries(input.elements)) {
      if (!ELEMENT_NAMES.includes(name as ElementName) || !tr) continue;
      const clean = sanitizeElementTransform(tr);
      // An all-default transform (0,0,1) is the same as no override — drop it
      // so the file only ever records real nudges, not every element touched.
      if (clean.x || clean.y || (clean.scale !== undefined && clean.scale !== 1)) elements[name] = clean;
    }
    if (Object.keys(elements).length) out.elements = elements;
  }
  return out;
}

const cache = new Map<string, LayoutOverrideFile>();

/** Config-as-code, same as tokens.ts and entities.ts: versioned, diffable, reviewable in a PR. */
function pathFor(brandKey: string): string {
  return resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'layout-overrides.json');
}

export function loadLayoutOverrides(brandKey: string, path = pathFor(brandKey)): LayoutOverrideFile {
  const cached = cache.get(path);
  if (cached) return cached;
  let file: LayoutOverrideFile = {};
  if (existsSync(path)) {
    try { file = JSON.parse(readFileSync(path, 'utf8')) as LayoutOverrideFile; }
    catch { file = {}; } // A corrupt override file degrades to "no overrides", never a crashed render.
  }
  cache.set(path, file);
  return file;
}

export function resetLayoutOverrideCache(): void { cache.clear(); }

export function getLayoutOverride(brandKey: string, archetype: string, layout: string): LayoutOverride {
  return loadLayoutOverrides(brandKey)[archetype]?.[layout] ?? {};
}

/** Persists one archetype/layout's override, merging into whatever else already exists for that brand. */
export function saveLayoutOverride(brandKey: string, archetype: string, layout: string, patch: Partial<LayoutOverride>): LayoutOverride {
  const path = pathFor(brandKey);
  const file = { ...loadLayoutOverrides(brandKey, path) };
  const clean = sanitizeOverride(patch);
  file[archetype] = { ...file[archetype], [layout]: clean };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  cache.set(path, file);
  return clean;
}

/** Back to the brand's plain tokens for this one layout. */
export function clearLayoutOverride(brandKey: string, archetype: string, layout: string): void {
  const path = pathFor(brandKey);
  const file = { ...loadLayoutOverrides(brandKey, path) };
  if (file[archetype]) {
    const { [layout]: _removed, ...rest } = file[archetype];
    if (Object.keys(rest).length) file[archetype] = rest; else delete file[archetype];
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  cache.set(path, file);
}
