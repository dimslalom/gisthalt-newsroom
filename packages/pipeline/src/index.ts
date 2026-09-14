import { accountForClaim, prepareReview, releaseHeldIfCorroborated } from './review.ts';
import type { Platform } from '@newsroom/core';
import { getCtx, type Ctx } from './context.ts';
import { pollDue, pollSource } from './stages/poll.ts';
import { extractItem } from './stages/extract.ts';
import { gateClaim } from './stages/gate.ts';
import { composeClaim, PLATFORMS } from './stages/compose.ts';
import { enqueuePost } from './stages/publish.ts';
import { attachResultsCarousel } from './results-carousel.ts';

export * from './context.ts';
export * from './stages/poll.ts';
export * from './stages/extract.ts';
export * from './stages/gate.ts';
export * from './stages/compose.ts';
export * from './stages/publish.ts';
export * from './review.ts';
export * from './post-design.ts';
export * from './regenerate-reviews.ts';

export interface TickResult {
  polled: { source: string; inserted: number; error?: string }[];
  extracted: number;
  gated: Record<string, number>;
  composed: number;
  queued: number;
  published: number;
  expired: number;
}

/**
 * One pass of the whole pipeline. Every stage is separate so a failure is
 * attributable to a stage and a retry never re-runs work already paid for.
 */
export async function tick(ctx: Ctx = getCtx(), opts: { accountId?: string; platforms?: Platform[]; render?: boolean } = {}): Promise<TickResult> {
  const accountId = opts.accountId;
  const result: TickResult = { polled: [], extracted: 0, gated: {}, composed: 0, queued: 0, published: 0, expired: 0 };

  result.polled = (await pollDue(ctx)).map((p) => ({ source: p.source, inserted: p.inserted, error: p.error }));

  // Extract only items that have never produced a claim.
  const claimedItemIds = new Set(ctx.store.extractions.map((c) => c.itemId));
  for (const item of ctx.store.items.filter((i) => !claimedItemIds.has(i.id))) {
    const out = await extractItem(ctx, item);
    result.extracted += out.claims;
  }

  // Gate only claims that have never been decided.
  const decided = new Set(ctx.store.decisions.map((d) => d.claimId));
  for (const claim of ctx.store.claims.filter((c) => !decided.has(c.id))) {
    const outcome = gateClaim(ctx, claim);
    result.gated[outcome.outcome] = (result.gated[outcome.outcome] ?? 0) + 1;
    if (outcome.outcome === 'review') {
      const review = ctx.store.reviews.find((r) => r.claimId === claim.id && r.state === 'pending');
      if (review) {
        await attachResultsCarousel(ctx, claim, review.id).catch((e) =>
          ctx.store.log({ stage: 'review', level: 'warn', msg: 'results carousel attach failed', dedupeHash: claim.dedupeHash, latencyMs: null, meta: { reviewId: review.id, error: (e as Error).message } }));
      }
    }
  }

  // Compose every auto-gated claim that has no composition yet, not only the
  // ones gated on this pass: a stage that crashed mid-tick must be resumable.
  const composedClaimIds = new Set(ctx.store.compositions.filter((c) => c.renderedAt && c.imagePaths.length).map((c) => c.claimId));
  const autoClaimIds = new Set(ctx.store.decisions.filter((d) => d.outcome === 'auto').map((d) => d.claimId));
  const autos = ctx.store.claims.filter((c) => autoClaimIds.has(c.id) && !composedClaimIds.has(c.id));

  if (opts.render !== false) {
    for (const claim of autos) {
      try {
        const comp = await composeClaim(ctx, claim, accountId ?? accountForClaim(ctx, claim.id));
        result.composed += 1;
        result.queued += enqueuePost(ctx, comp, opts.platforms ?? PLATFORMS).queued;
      } catch (e) {
        ctx.store.log({ stage: 'compose', level: 'error', msg: 'compose failed', dedupeHash: claim.dedupeHash, latencyMs: null, meta: { claimId: claim.id, error: (e as Error).message } });
      }
    }
    for (const review of ctx.store.pendingReviews(ctx.now())) {
      try { await prepareReview(ctx, review.id); }
      catch (e) { ctx.store.log({ stage: 'review', level: 'error', msg: 'preview failed', dedupeHash: null, latencyMs: null, meta: { reviewId: review.id, error: (e as Error).message } }); }
    }
    await releaseHeldIfCorroborated(ctx);

  }

  result.expired = ctx.store.expireStaleReviews(ctx.now()).length;
  ctx.store.saveNow();
  return result;
}

export { pollSource };
export * from './seed.ts';
export * from './ops.ts';
export * from './carousel.ts';
export * from './results-carousel.ts';
