import { pickBest, seedFrom, type Candidate, type HistoryEntry } from '@newsroom/core';
import type { Claim } from '@newsroom/core';
import { ContrastError, assertContrast } from './guards/contrast.ts';
import { accentSets } from './skins.ts';
import { isLayoutShippable } from './passing.ts';
import { resolvedLayouts } from './layout-slots.ts';
import { resolveColours } from './template.ts';
import type { Brand, CompositionSpec, LayoutKey, Skin } from './types.ts';

export interface ComposeInput {
  brand: Brand;
  claim: Claim;
  /** Newest first. The last 12 compositions for this account. */
  history: HistoryEntry[];
  /** Bump to reshuffle the same claim into a different-looking post. */
  reshuffle?: number;
  hasImage: boolean;
  allowUncertified?: boolean;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export class NoArchetypeError extends Error {}

export function chooseArchetype(brand: Brand, claimType: string) {
  const a = brand.archetypes.find((x) => x.claimTypes.includes(claimType));
  if (!a) throw new NoArchetypeError(`no archetype for claimType "${claimType}" in brand ${brand.key}`);
  return a;
}

/**
 * Archetype comes from the data. Layout, skin and accents come from the shuffle
 * bag. Anything that fails a guard is dropped from the candidate pool rather
 * than fixed up afterwards, so an unrenderable combination can never be chosen.
 */
export function compose(input: ComposeInput): CompositionSpec & { seed: number } {
  const { brand, claim, history, hasImage } = input;
  const log = input.log ?? (() => {});
  const archetype = chooseArchetype(brand, claim.claimType);
  const model = archetype.model(claim);

  const slots = resolvedLayouts(brand.key, archetype.key, archetype.layouts);
  let slotCandidates = input.allowUncertified ? slots : slots.filter((s) => isLayoutShippable(brand.key, archetype.key, s.key));
  if (slotCandidates.length === 0) throw new Error(`no certified layout for ${brand.key}/${archetype.key}; run the full golden matrix`);
  // image-missing must fall back to a typography-only variant, never a grey box.
  if (!hasImage) {
    const typographic = slotCandidates.filter((s) => s.worksWithoutImage);
    if (typographic.length) slotCandidates = typographic;
  }
  // A very long headline escapes to a layout built for one.
  if (model.headline.length > 78) {
    const roomy = slotCandidates.filter((s) => s.handlesLongHeadline);
    if (roomy.length) slotCandidates = roomy;
  }
  const layouts = slotCandidates.map((s) => s.key);

  const skins = brand.skins;
  const candidates: Candidate[] = [];
  for (const layout of layouts) {
    for (const skin of skins) {
      for (const accents of accentSets()) {
        const spec: CompositionSpec = { brand, archetype, layout, skin, accents, model };
        try {
          resolveColours(spec); // throws ContrastError on an unreadable pairing
          const { pairs } = resolveColours(spec);
          assertContrast(pairs);
          candidates.push({ layout, skin: skin.key, accents });
        } catch (e) {
          if (!(e instanceof ContrastError)) throw e;
          // colour-clash: this skin cannot carry this entity colour. Drop it.
        }
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`composer found no contrast-safe candidate for claim ${claim.claimType}`);
  }

  const seed = seedFrom(`${claim.claimType}:${model.headline}`, input.reshuffle ?? 0);
  const picked = pickBest(candidates, history, seed);
  // Look the skin back up from THIS brand's own set, never the shared global
  // list — two brands can both declare a 'dark' key with entirely different
  // colours, and the wrong one silently substituting back in here would
  // undo every bit of per-brand identity the candidate loop just verified.
  const skin = skins.find((s) => s.key === picked.skin) as Skin;

  return {
    brand,
    archetype,
    layout: picked.layout as LayoutKey,
    skin,
    accents: picked.accents as CompositionSpec['accents'],
    model,
    seed,
  };
}

/** Every valid combination for one archetype. Powers the lab's "render all variants". */
export function enumerateVariants(brand: Brand, archetypeKey: string): { layout: LayoutKey; skin: string; accents: string[] }[] {
  const a = brand.archetypes.find((x) => x.key === archetypeKey);
  if (!a) return [];
  const out: { layout: LayoutKey; skin: string; accents: string[] }[] = [];
  for (const slot of resolvedLayouts(brand.key, a.key, a.layouts)) for (const skin of brand.skins) for (const accents of accentSets()) {
    out.push({ layout: slot.key, skin: skin.key, accents });
  }
  return out;
}
