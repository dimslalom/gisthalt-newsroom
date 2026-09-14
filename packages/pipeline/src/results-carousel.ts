import type { ClaimRow } from '@newsroom/db';
import type { Ctx } from './context.ts';
import { createCarousel } from './carousel.ts';

const RESULTS_RE = /\b(results?|standings|classification|klasemen|hasil)\b/i;

/**
 * A prose "article" claim that reads like a results/standings roundup — the
 * headline promises numbers the article text alone can't carry — gets the
 * matching tier-A classification/standings claims attached as carousel
 * slides, so the post actually shows the table it's about.
 *
 * Matching is by recency, not an exact meeting-name string: tier-A meeting
 * labels (e.g. openf1's "Spain GP") and LLM-extracted article entities don't
 * reliably agree on format, and jolpica's standings claims carry no meeting
 * at all (they're season-wide, not per-race). Safe in practice because only
 * one race weekend is ever "current" for a given vertical at a time.
 */
export async function attachResultsCarousel(ctx: Ctx, articleRow: ClaimRow, reviewId: string): Promise<boolean> {
  if (articleRow.claimType !== 'article') return false;
  const item = ctx.store.getItem(articleRow.itemId);
  if (!RESULTS_RE.test(`${articleRow.headline ?? ''} ${item?.title ?? ''}`)) return false;

  const cutoffMs = ctx.now().getTime() - 48 * 60 * 60_000;
  const mostRecent = (claimType: string): ClaimRow | undefined =>
    ctx.store.claims
      .filter((c) => c.id !== articleRow.id && c.vertical === articleRow.vertical && c.claimType === claimType && c.observedAt.getTime() >= cutoffMs)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];

  const extras = [mostRecent('classification'), mostRecent('standings')].filter((c): c is ClaimRow => Boolean(c));
  if (!extras.length) return false;

  const carousel = await createCarousel(ctx, [articleRow.id, ...extras.map((c) => c.id)]);
  ctx.store.resolveReview(reviewId, 'rejected', ctx.now(), 'superseded by auto-attached results carousel');
  ctx.store.log({
    stage: 'review', level: 'info', msg: 'auto-attached results carousel', dedupeHash: articleRow.dedupeHash, latencyMs: null,
    meta: { originalReviewId: reviewId, carouselReviewId: carousel.review.id, slides: extras.map((c) => c.claimType) },
  });
  return true;
}
