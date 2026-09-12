import { brandForVertical } from '@newsroom/brands';
import { compose } from '@newsroom/design';
import type { ClaimRow, CompositionRow } from '@newsroom/db';
import { fitCaption } from '@newsroom/core';
import { writeCaption } from '@newsroom/llm';
import { renderRemote } from '@newsroom/render';
import type { Platform } from '@newsroom/core';
import type { Ctx } from '../context.ts';
import { claimOf } from './gate.ts';

export const PLATFORMS: Platform[] = ['x', 'instagram', 'threads', 'tiktok'];

/**
 * Stage 4. Archetype from the data, everything else from the shuffle bag
 * against the last 12 compositions for this account. Caption copy starts from
 * the template and is only rephrased by the model; no fact is ever added.
 */
export async function composeClaim(ctx: Ctx, row: ClaimRow, accountId: string, reshuffle = 0): Promise<CompositionRow> {
  const brand = brandForVertical(row.vertical);
  const account = ctx.store.getAccount(accountId);
  if (!account || account.brand !== brand.key) throw new Error('composition account does not match the claim brand');
  const previous = ctx.store.compositions.find((c) => c.claimId === row.id && c.accountId === accountId && c.renderedAt && c.imagePaths.length && reshuffle === 0);
  if (previous) return previous;
  const claim = claimOf(row);
  const history = ctx.store.recentCompositions(accountId, 12).map((c) => ({ layout: c.layout, skin: c.skin, accents: c.accents }));

  const spec = compose({
    brand, claim, history, reshuffle,
    hasImage: Boolean(row.imageUrl),
    log: (msg, meta) => ctx.store.log({ stage: 'compose', level: 'warn', msg, dedupeHash: row.dedupeHash, latencyMs: null, meta: meta ?? {} }),
  });

  const fallback = (brand.copy[spec.archetype.key] ?? (() => spec.model.headline))(spec.model, claim);
  const captions: Record<string, string> = {};
  for (const platform of PLATFORMS) {
    const limit = platform === 'x' ? 280 : platform === 'threads' ? 500 : 2200;
    const written = await writeCaption(
      ctx.router, claim,
      { headline: spec.model.headline, eyebrow: spec.model.eyebrow, subhead: spec.model.subhead, bigNumber: spec.model.bigNumber, rows: (spec.model.rows ?? []).slice(0, 3) },
      platform, limit, fitCaption(fallback, platform),
    );
    captions[platform] = fitCaption(written.caption, platform);
  }

  const pending = ctx.store.compositions.find((c) => c.claimId === row.id && c.accountId === accountId && !c.renderedAt);
  const comp = pending ?? ctx.store.insertComposition({
    claimId: row.id,
    accountId,
    archetype: spec.archetype.key,
    layout: spec.layout,
    skin: spec.skin.key,
    accents: [...spec.accents],
    captionByPlatform: captions,
    imagePaths: [],
    seed: spec.seed,
    renderedAt: null,
    createdAt: ctx.now(),
  });

  // A failed render may be retried after the shuffle history changes. Persist
  // the same treatment and captions that this attempt sends to the renderer.
  if (pending) ctx.store.updateComposition(comp.id, { archetype: spec.archetype.key, layout: spec.layout, skin: spec.skin.key, accents: [...spec.accents], captionByPlatform: captions, seed: spec.seed });

  const started = Date.now();
  const out = await renderRemote({ brand: brand.key, claim, archetype: spec.archetype.key, layout: spec.layout, skin: spec.skin.key, accents: [...spec.accents], imagePath: row.imageUrl, fileName: `${comp.id}.png` });
  ctx.store.updateComposition(comp.id, { imagePaths: [out.path], renderedAt: ctx.now() });

  ctx.store.log({
    stage: 'render', level: 'info', msg: 'rendered', dedupeHash: row.dedupeHash, latencyMs: Date.now() - started,
    meta: { compositionId: comp.id, archetype: spec.archetype.key, layout: spec.layout, skin: spec.skin.key, accents: spec.accents, guards: out.guards },
  });

  return ctx.store.getComposition(comp.id)!;
}
