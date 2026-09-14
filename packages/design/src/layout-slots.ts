import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BUILTIN_LAYOUTS } from './types.ts';

/**
 * A layout slot the composer may pick for one archetype — one of the eight
 * built-ins, or one a designer added at runtime. Kept as data, not a code
 * change, the same spirit as layout-overrides.json and theme-override.json:
 * one config-as-code JSON file per brand, versioned and reviewable in a PR.
 * A brand's compiled `archetype.layouts` stays the *default* set; this file
 * only ever adds to or removes from it — the built-in eight are never edited
 * in place.
 */
export interface LayoutSlotDef {
  key: string;
  label: string;
  /** image-missing may fall back to this slot. Built-ins: framed/stacked/big-number. */
  worksWithoutImage?: boolean;
  /** fitText overflow may escape to this slot. Built-ins: stacked/framed. */
  handlesLongHeadline?: boolean;
}

export interface LayoutSlotsFile {
  [archetype: string]: { add?: LayoutSlotDef[]; remove?: string[] };
}

const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_SLOTS_PER_ARCHETYPE = 12;

/** The built-in flags — replaces skins.ts's old TYPOGRAPHY_ONLY/LONG_HEADLINE
 *  arrays so a custom slot can carry the same two properties as data instead
 *  of a brand needing a code change to declare them. */
export const BUILTIN_LAYOUT_FLAGS: Record<string, { worksWithoutImage: boolean; handlesLongHeadline: boolean }> = {
  'hero-left': { worksWithoutImage: false, handlesLongHeadline: false },
  'hero-right': { worksWithoutImage: false, handlesLongHeadline: false },
  'full-bleed': { worksWithoutImage: false, handlesLongHeadline: false },
  framed: { worksWithoutImage: true, handlesLongHeadline: true },
  split: { worksWithoutImage: false, handlesLongHeadline: false },
  stacked: { worksWithoutImage: true, handlesLongHeadline: true },
  'big-number': { worksWithoutImage: true, handlesLongHeadline: false },
  portrait: { worksWithoutImage: false, handlesLongHeadline: false },
};

function pathFor(brandKey: string): string {
  return resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'layout-slots.json');
}

const cache = new Map<string, LayoutSlotsFile>();

export function loadLayoutSlots(brandKey: string, path = pathFor(brandKey)): LayoutSlotsFile {
  const cached = cache.get(path);
  if (cached) return cached;
  let file: LayoutSlotsFile = {};
  if (existsSync(path)) {
    // A corrupt file degrades to "no customisation", never a crashed render.
    try { file = JSON.parse(readFileSync(path, 'utf8')) as LayoutSlotsFile; } catch { file = {}; }
  }
  cache.set(path, file);
  return file;
}

export function resetLayoutSlotsCache(): void { cache.clear(); }

/** The layout slots this archetype actually offers right now: the compiled
 *  defaults, minus anything this brand removed, plus anything it added. */
export function resolvedLayouts(brandKey: string, archetypeKey: string, compiledLayouts: readonly string[]): LayoutSlotDef[] {
  const file = loadLayoutSlots(brandKey)[archetypeKey] ?? {};
  const removed = new Set(file.remove ?? []);
  const base = compiledLayouts
    .filter((key) => !removed.has(key))
    .map((key) => ({ key, label: key, ...(BUILTIN_LAYOUT_FLAGS[key] ?? { worksWithoutImage: false, handlesLongHeadline: false }) }));
  const custom = (file.add ?? []).filter((s) => !base.some((b) => b.key === s.key));
  return [...base, ...custom];
}

function sanitiseSlot(v: unknown): LayoutSlotDef | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.key !== 'string' || !KEY_RE.test(o.key)) return undefined;
  if ((BUILTIN_LAYOUTS as readonly string[]).includes(o.key)) return undefined; // can't shadow a built-in
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 60) : o.key;
  return { key: o.key, label, worksWithoutImage: Boolean(o.worksWithoutImage), handlesLongHeadline: Boolean(o.handlesLongHeadline) };
}

/** Adds one custom slot. Re-adding a key this brand previously removed
 *  un-removes it, so remove-then-add always leaves the slot present. */
export function addLayoutSlot(brandKey: string, archetypeKey: string, input: unknown): LayoutSlotsFile {
  const slot = sanitiseSlot(input);
  if (!slot) throw new Error('invalid slot: key must be lowercase-with-hyphens and not a built-in layout name');
  const path = pathFor(brandKey);
  const file = { ...loadLayoutSlots(brandKey, path) };
  const entry = { add: [...(file[archetypeKey]?.add ?? [])], remove: (file[archetypeKey]?.remove ?? []).filter((k) => k !== slot.key) };
  if (entry.add.some((s) => s.key === slot.key)) throw new Error(`slot "${slot.key}" already exists`);
  if (entry.add.length >= MAX_SLOTS_PER_ARCHETYPE) throw new Error(`at most ${MAX_SLOTS_PER_ARCHETYPE} custom slots per archetype`);
  entry.add.push(slot);
  file[archetypeKey] = entry;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  cache.set(path, file);
  return file;
}

/** Removing a built-in records it in `remove`; removing a custom slot just
 *  drops it from `add` — no need to remember removing something the compiled
 *  archetype never declared in the first place. Refuses to remove the last
 *  slot an archetype has, since that archetype could then never compose. */
export function removeLayoutSlot(brandKey: string, archetypeKey: string, key: string, compiledLayouts: readonly string[]): LayoutSlotsFile {
  const path = pathFor(brandKey);
  const file = { ...loadLayoutSlots(brandKey, path) };
  const entry = { add: (file[archetypeKey]?.add ?? []).filter((s) => s.key !== key), remove: [...(file[archetypeKey]?.remove ?? [])] };
  if (compiledLayouts.includes(key) && !entry.remove.includes(key)) entry.remove.push(key);
  const remaining = compiledLayouts.filter((k) => !entry.remove.includes(k)).length + entry.add.length;
  if (remaining === 0) throw new Error('cannot remove the last layout slot for this archetype');
  if (entry.add.length || entry.remove.length) file[archetypeKey] = entry; else delete file[archetypeKey];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  cache.set(path, file);
  return file;
}
