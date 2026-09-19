import { brandForVertical, workspaceBrand, platformsForBrand } from '@newsroom/brands';
import { compose, type Archetype, type ArtModel, type Brand } from '@newsroom/design';
import type { ClaimRow, CompositionRow } from '@newsroom/db';
import { fitCaption, needsHook, type Claim } from '@newsroom/core';
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
  // The headline is the hook, and it is always Indonesian. No hook, no post.
  if (needsHook(row)) throw new Error('waiting for an Indonesian hook headline');
  const brand = brandForVertical(row.vertical);
  const account = ctx.store.getAccount(accountId);
  if (!account || workspaceBrand(ctx.store, account.brand).vertical !== row.vertical || !platformsForBrand(ctx.store, account.brand).includes(account.platform)) throw new Error('composition account does not match the claim brand');
  const previous = ctx.store.compositions.find((c) => c.claimId === row.id && c.accountId === accountId && c.renderedAt && c.imagePaths.length && reshuffle === 0);
  if (previous) return previous;
  const claim = claimOf(row);
  const history = ctx.store.recentCompositions(accountId, 12).map((c) => ({ layout: c.layout, skin: c.skin, accents: c.accents }));

  const spec = compose({
    brand, claim, history, reshuffle,
    hasImage: Boolean(row.imageUrl),
    log: (msg, meta) => ctx.store.log({ stage: 'compose', level: 'warn', msg, dedupeHash: row.dedupeHash, latencyMs: null, meta: meta ?? {} }),
  });

  const captions = await captionsFor(ctx, brand, spec.archetype, spec.model, claim);

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

async function captionsFor(ctx: Ctx, brand: Brand, archetype: Archetype, model: ArtModel, claim: Claim): Promise<Record<string, string>> {
  const fallback = (brand.copy[archetype.key] ?? (() => model.headline))(model, claim);
  const captions: Record<string, string> = {};
  for (const platform of PLATFORMS) {
    const limit = platform === 'x' ? 280 : platform === 'threads' ? 500 : 2200;
    const written = await writeCaption(
      ctx.router, claim,
      { headline: model.headline, eyebrow: model.eyebrow, subhead: model.subhead, bigNumber: model.bigNumber, rows: (model.rows ?? []).slice(0, 3) },
      platform, limit, fitCaption(fallback, platform), brand.voiceGuide,
    );
    captions[platform] = fitCaption(written.caption, platform);
  }
  return captions;
}

/**
 * Rebuilds an existing composition's headline, captions and artwork from its
 * claim as it is now (e.g. after its hook headline was written), keeping the
 * layout, skin, accents and any hand-edited design it already has.
 */
export async function refreshComposition(ctx: Ctx, compositionId: string): Promise<CompositionRow> {
  const patch = await prepareRefresh(ctx, compositionId);
  return ctx.store.updateComposition(compositionId, patch)!;
}

/**
 * The read-and-render half of refreshComposition: writes nothing, so it can
 * run against a lock-free snapshot (see readStore) while only the returned
 * patch is committed under the write lock.
 */
export async function prepareRefresh(ctx: Ctx, compositionId: string): Promise<Pick<CompositionRow, 'captionByPlatform' | 'imagePaths' | 'renderedAt' | 'skin'>> {
  const comp = ctx.store.getComposition(compositionId);
  if (!comp) throw new Error('unknown composition');
  if (ctx.store.posts.some((p) => p.compositionId === comp.id && ['publishing', 'uncertain', 'published', 'retraction_requested', 'retracted'].includes(p.status))) {
    throw new Error('composition has a live or unresolved publication');
  }
  if (comp.imagePaths.length > 1) throw new Error('carousel compositions are not refreshed');
  const row = ctx.store.getClaim(comp.claimId);
  if (!row) throw new Error('composition has no claim');
  if (needsHook(row)) throw new Error('waiting for an Indonesian hook headline');
  const brand = brandForVertical(row.vertical);
  const archetype = brand.archetypes.find((a) => a.key === comp.archetype);
  if (!archetype) throw new Error(`unknown archetype ${comp.archetype}`);
  const claim = claimOf(row);
  const captions = await captionsFor(ctx, brand, archetype, archetype.model(claim), claim);
  // A skin this brand has since retired falls back to its first skin, and the
  // composition records the one it was actually rendered with.
  const skin = brand.skins.some((s) => s.key === comp.skin) ? comp.skin : brand.skins[0]!.key;
  const out = await renderRemote({
    brand: brand.key, claim, archetype: comp.archetype, layout: comp.layout,
    skin, accents: comp.accents, imagePath: row.imageUrl, doc: comp.doc ?? undefined,
    fileName: `${comp.id}-${Date.now()}.png`,
  });
  return { captionByPlatform: captions, imagePaths: [out.path], renderedAt: ctx.now(), skin };
}
