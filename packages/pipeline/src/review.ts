import { evaluateGate, validateCaption, type Platform } from '@newsroom/core';
import { brandForVertical, workspaceBrands, platformsForBrand } from '@newsroom/brands';
import type { CompositionRow, ReviewRow } from '@newsroom/db';
import type { Ctx } from './context.ts';
import { composeClaim, PLATFORMS } from './stages/compose.ts';
import { claimOf } from './stages/gate.ts';
import { enqueuePost } from './stages/publish.ts';

/** The controlled first-launch fan-out. Threads stays out until its own acceptance run. */
export const F1_LAUNCH_PLATFORMS: Platform[] = ['x', 'instagram', 'tiktok'];

function actionable(ctx: Ctx, reviewId: string): ReviewRow {
  const review = ctx.store.getReview(reviewId);
  if (!review) throw new Error('review not found');
  if (!['pending', 'held'].includes(review.state)) throw new Error(`review is ${review.state}`);
  if (review.expiresAt <= ctx.now()) throw new Error('review has expired');
  return review;
}
export function accountForClaim(ctx: Ctx, claimId: string): string {
  const claim = ctx.store.getClaim(claimId);
  if (!claim) throw new Error('claim not found');
  const brands = workspaceBrands(ctx.store).filter(b => b.vertical === claim.vertical);
  const accounts = ctx.store.accounts.filter((a) => brands.some(b => b.key === a.brand) && platformsForBrand(ctx.store, a.brand).includes(a.platform));
  const account = accounts.find((a) => a.active) ?? accounts[0];
  if (!account) throw new Error(`no configured account for ${claim.vertical}`);
  return account.id;
}
export async function prepareReview(ctx: Ctx, reviewId: string): Promise<CompositionRow> {
  const review = actionable(ctx, reviewId);
  const existing = review.compositionId ? ctx.store.getComposition(review.compositionId) : undefined;
  if (existing?.renderedAt && existing.imagePaths.length) return existing;
  const comp = await composeClaim(ctx, ctx.store.getClaim(review.claimId)!, accountForClaim(ctx, review.claimId));
  review.compositionId = comp.id;
  return comp;
}
export async function approve(ctx: Ctx, reviewId: string, accountId?: string, platforms: Platform[] = PLATFORMS) {
  const previous = ctx.store.getReview(reviewId);
  if (previous?.state === 'approved') return { review: previous, composition: ctx.store.getComposition(previous.compositionId!)! };
  const review = actionable(ctx, reviewId);
  const composition = await prepareReview(ctx, reviewId);
  if (accountId && ctx.store.getAccount(accountId)?.brand !== ctx.store.getAccount(composition.accountId)?.brand) throw new Error('account brand mismatch');
  const out = enqueuePost(ctx, composition, composition.imagePaths.length > 4 ? platforms.filter((p) => p !== 'x') : platforms);
  if (!ctx.store.posts.some((p) => p.compositionId === composition.id)) throw new Error(out.skipped.map((s) => s.reason).join('; ') || 'no publishing accounts enabled');
  ctx.store.resolveReview(reviewId, 'approved', ctx.now(), 'approved by owner');
  ctx.store.log({ stage: 'review', level: 'info', msg: 'approved', dedupeHash: ctx.store.getClaim(review.claimId)!.dedupeHash, latencyMs: null, meta: { reviewId, compositionId: composition.id } });
  return { review, composition };
}

/**
 * Queue one reviewed F1 composition for the three launch platforms only.
 * This does not bypass the normal account, warm-up, pacing, receipt, or
 * reconciliation safeguards; the native agent still performs the external
 * submission later, using its own live/dry-run environment.
 */
export async function approveF1Launch(ctx: Ctx, reviewId: string) {
  const review = actionable(ctx, reviewId);
  const claim = ctx.store.getClaim(review.claimId);
  if (!claim || claim.vertical !== 'f1') throw new Error('the three-platform launch is available only for an F1 review');
  const problems: string[] = [];
  const launchBrand = ctx.store.getAccount(accountForClaim(ctx, claim.id))!.brand;
  for (const platform of F1_LAUNCH_PLATFORMS) {
    const account = ctx.store.accounts.find((row) => row.brand === launchBrand && row.platform === platform && row.active);
    if (!account) { problems.push(`${platform}: inactive`); continue; }
    if (!account.handle.trim() || /placeholder/i.test(account.handle) || account.warmupStage < 1 || account.dailyCap < 1) { problems.push(`${platform}: account setup or warm-up incomplete`); continue; }
    const session = ctx.store.sessions.find((row) => row.accountId === account.id);
    if (!session?.healthy) problems.push(`${platform}: native browser session has not passed a login check`);
  }
  if (problems.length) throw new Error(`F1 launch preflight failed — ${problems.join('; ')}`);
  return approve(ctx, reviewId, undefined, F1_LAUNCH_PLATFORMS);
}
export function reject(ctx: Ctx, reviewId: string, note = 'rejected by owner') {
  actionable(ctx, reviewId);
  return ctx.store.resolveReview(reviewId, 'rejected', ctx.now(), note)!;
}
export function holdForSecondSource(ctx: Ctx, reviewId: string) {
  actionable(ctx, reviewId);
  return ctx.store.resolveReview(reviewId, 'held', ctx.now(), 'held for a second source')!;
}
export async function reshuffle(ctx: Ctx, reviewId: string, _accountId?: string): Promise<CompositionRow> {
  const review = actionable(ctx, reviewId);
  const n = ctx.store.compositions.filter((c) => c.claimId === review.claimId).length;
  const comp = await composeClaim(ctx, ctx.store.getClaim(review.claimId)!, accountForClaim(ctx, review.claimId), n + 1);
  review.compositionId = comp.id;
  return comp;
}
export function editCaption(ctx: Ctx, compositionId: string, platform: Platform, caption: string) {
  const comp = ctx.store.getComposition(compositionId);
  if (!comp) throw new Error('composition not found');
  const review = ctx.store.reviews.find((r) => r.compositionId === compositionId && ['pending', 'held'].includes(r.state) && r.expiresAt > ctx.now())
    ?? ctx.store.reviews.find((r) => r.compositionId === compositionId);
  if (!review) throw new Error('only review captions can be edited');
  actionable(ctx, review.id);
  validateCaption(caption, platform);
  return ctx.store.updateComposition(comp.id, { captionByPlatform: { ...comp.captionByPlatform, [platform]: caption } })!;
}
/** Cancels queued work; live deletion requires platform-side confirmation. */
export function retract(ctx: Ctx, postId: string, note = 'retraction requested by owner') {
  const post = ctx.store.posts.find((p) => p.id === postId);
  if (!post) throw new Error('post not found');
  const live = ['published', 'publishing', 'uncertain'].includes(post.status);
  ctx.store.updatePost(postId, { status: live ? 'retraction_requested' : 'cancelled', error: note });
  ctx.store.log({ stage: 'publish', level: 'warn', msg: live ? 'manual platform removal required' : 'queued post cancelled', dedupeHash: null, latencyMs: null, meta: { postId, platformPostId: post.platformPostId } });
  return { cancelled: !live, manualRemovalRequired: live, platformPostId: post.platformPostId };
}
export async function releaseHeldIfCorroborated(ctx: Ctx, _accountId?: string): Promise<string[]> {
  ctx.store.expireStaleReviews(ctx.now());
  const released: string[] = [];
  for (const review of ctx.store.reviews.filter((r) => r.state === 'held')) {
    const row = ctx.store.getClaim(review.claimId)!;
    const brand = brandForVertical(row.vertical);
    const outcome = evaluateGate(claimOf(row), {
      now: ctx.now(), tierBAllowlist: brand.tierBAllowlist, blocklist: brand.blocklist, hedgeTerms: brand.hedgeTerms,
      requiredFields: brand.requiredFields, corroboration: ctx.store.corroborationFor(row.dedupeHash, row.itemId),
      corroborationWindowMinutes: 45, enableR2: false, enableR3: process.env.ENABLE_R3 === 'true',
    });
    if (outcome.rule === 'R3') {
      await approve(ctx, review.id);
      ctx.store.insertDecision({ claimId: row.id, ...outcome, corroboratingItemIds: outcome.corroboratingItemIds ?? [], decidedAt: ctx.now() });
      released.push(review.id);
    }
  }
  return released;
}
