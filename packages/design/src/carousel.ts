import type { Claim } from '@newsroom/core';
import { compose } from './composer.ts';
import type { Brand, CompositionSpec } from './types.ts';
/** Sequence grammar over existing single-post archetypes, at one fixed skin. */
export function composeCarousel(brand: Brand, claims: Claim[]): CompositionSpec[] {
  if (claims.length < 2 || claims.length > 6) throw new Error('carousel needs 2–6 body claims');
  if (claims.some((c) => c.vertical !== brand.vertical)) throw new Error('carousel claims must share one brand');
  const body = claims.map((claim) => compose({ brand, claim, history: [], hasImage: Boolean(claim.imageUrl) }));
  const skin = body[0]!.skin;
  const fixed = body.map((spec) => ({ ...spec, skin, accents: body[0]!.accents }));
  const first = fixed[0]!;
  const cover = { ...first, model: { ...first.model, rows: undefined, headline: `Rangkuman ${brand.name}`, subhead: first.model.eyebrow, bigNumber: undefined } };
  const outro = { ...first, model: { ...first.model, rows: undefined, headline: `Ikuti ${brand.name}`, subhead: 'Berita terverifikasi. Ringkas dalam bahasa Indonesia.', bigNumber: undefined } };
  return [cover, ...fixed, outro];
}
