import { validateCaption, type Platform, type PublishRequest, type PublishResult } from '@newsroom/core';
import { adapterFor, archivePost, checkPacing, defaultPacing, jitterMs } from '@newsroom/publish';
import type { CompositionRow, PostRow } from '@newsroom/db';
import type { Ctx } from '../context.ts';
import { withCtx } from '../context.ts';
import { workspaceBrand, platformsForBrand } from '@newsroom/brands';

export interface EnqueueSummary { queued: number; skipped: { platform: string; reason: string }[] }
export function enqueuePost(ctx: Ctx, comp: CompositionRow, platforms: Platform[]): EnqueueSummary {
  if (!comp.renderedAt || !comp.imagePaths.length) throw new Error('composition has not rendered successfully');
  const brand = ctx.store.getAccount(comp.accountId)?.brand;
  if (!brand || workspaceBrand(ctx.store, brand).vertical !== ctx.store.getClaim(comp.claimId)?.vertical) throw new Error('composition no longer matches brand content type');
  const out: EnqueueSummary = { queued: 0, skipped: [] };
  for (const platform of platforms) {
    const account = ctx.store.accounts.find((a) => a.brand === brand && a.platform === platform && a.active && platformsForBrand(ctx.store, brand).includes(platform));
    if (!account) { out.skipped.push({ platform, reason: `no active ${platform} account` }); continue; }
    validateCaption(comp.captionByPlatform[platform] ?? '', platform);
    // Reshuffling is visual, not a new publication of the same fact.
    const idempotencyKey = `${comp.claimId}:${account.id}`;
    const row = ctx.store.insertPost({ compositionId: comp.id, accountId: account.id, platform, status: 'ready', idempotencyKey,
      platformPostId: null, scheduledFor: new Date(ctx.now().getTime() + jitterMs(idempotencyKey, defaultPacing())),
      publishedAt: null, latencyMs: null, error: null, archivePath: null });
    if (row) out.queued++;
  }
  return out;
}

/** Runs inside a repository transaction. The publishing reservation is committed
 * before the browser opens. A crashed reservation is never retried blindly. */
export function reservePost(ctx: Ctx): { job: PostRow; request: PublishRequest } | null {
  const now = ctx.now();
  if (process.env.PUBLISH_KILL_SWITCH === 'true' || ctx.store.setting('killSwitch', false)) return null;
  for (const job of ctx.store.posts.filter((p) => ['ready', 'held'].includes(p.status) && (!p.scheduledFor || p.scheduledFor <= now)).sort((a,b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0))) {
    const account = ctx.store.getAccount(job.accountId);
    if (!account?.active) { job.status = 'held'; job.error = 'account inactive'; continue; }
    const cap = Math.min(account.dailyCap, [0, 3, 6, 9, 16][account.warmupStage] ?? 0);
    if (cap === 0) { job.status = 'held'; job.error = 'manual warm-up stage'; continue; }
    // One in-flight publication per account, also across multiple agents.
    if (ctx.store.posts.some((p) => p.accountId === account.id && ['publishing','uncertain','retraction_requested'].includes(p.status))) continue;
    const cfg = { ...defaultPacing(), dailyCap: cap };
    const verdict = checkPacing({ now, postsToday: ctx.store.postsPublishedToday(account.id, now), idempotencyKey: job.idempotencyKey }, cfg);
    if (verdict.allowed === false) { job.status = 'held'; job.error = verdict.reason; job.scheduledFor = verdict.retryAt; continue; }
    const latest = ctx.store.posts.filter((p) => p.accountId === account.id && p.publishedAt).sort((a,b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())[0];
    const interval = Number(process.env.PUBLISH_MIN_INTERVAL_SECONDS ?? 300) * 1000 + jitterMs(job.idempotencyKey, cfg);
    if (latest?.publishedAt && now.getTime() < latest.publishedAt.getTime() + interval) {
      job.scheduledFor = new Date(latest.publishedAt.getTime() + interval); continue;
    }
    const comp = ctx.store.getComposition(job.compositionId);
    if (!platformsForBrand(ctx.store, account.brand).includes(account.platform) || (comp && workspaceBrand(ctx.store, account.brand).vertical !== ctx.store.getClaim(comp.claimId)?.vertical)) { job.status = 'cancelled'; job.error = 'brand or platform configuration changed'; continue; }
    if (comp && process.env.PUBLISH_DRY_RUN === 'false' && ctx.store.getClaim(comp.claimId)?.tags.includes('demo')) { job.status='cancelled';job.error='demo data cannot publish live';continue; }
    if (!comp?.renderedAt || !comp.imagePaths.length) { job.status = 'failed'; job.error = 'render missing'; continue; }
    job.status = 'publishing'; job.error = null;
    return { job: { ...job }, request: { accountId: job.accountId, platform: job.platform, caption: comp.captionByPlatform[job.platform]!, imagePaths: comp.imagePaths, idempotencyKey: job.idempotencyKey } };
  }
  return null;
}
export function finishPost(ctx: Ctx, jobId: string, result: PublishResult, dryRun: boolean, archivePath: string | null) {
  const job = ctx.store.posts.find((p) => p.id === jobId);
  if (!job || !['publishing', 'retraction_requested'].includes(job.status)) throw new Error('job is not reserved');
  const retracting = job.status === 'retraction_requested';
  ctx.store.updatePost(job.id, {
    status: retracting ? 'retraction_requested' : result.ok ? (dryRun ? 'simulated' : 'published') : result.uncertain ? 'uncertain' : 'failed',
    platformPostId: result.platformPostId ?? null, publishedAt: result.ok ? ctx.now() : null,
    latencyMs: result.latencyMs, error: result.error ?? (retracting ? 'remove live post manually' : null), archivePath,
  });
  ctx.store.log({ stage: 'publish', level: result.ok ? 'info' : 'error', msg: job.status, dedupeHash: ctx.store.getClaim(ctx.store.getComposition(job.compositionId)!.claimId)?.dedupeHash ?? null,
    latencyMs: result.latencyMs, meta: { postId: job.id, platform: job.platform, dryRun, error: result.error } });
}
/** Native agent entry point; external effects are outside database transactions. */
export async function publishNext(): Promise<{ published: boolean; detail: string }> {
  const reservation = await withCtx(reservePost);
  if (!reservation) return { published: false, detail: 'nothing eligible' };
  const { job, request } = reservation;
  const sourceUrl = await withCtx(ctx=>{const comp=ctx.store.getComposition(job.compositionId);const claim=comp?ctx.store.getClaim(comp.claimId):undefined;return claim?ctx.store.getItem(claim.itemId)?.rawUrl??null:null;});
  const dryRun = process.env.PUBLISH_DRY_RUN !== 'false';
  let result: PublishResult;
  const adapter = adapterFor(job.platform);
  // The background monitor is useful observability, but it is not a sufficient
  // safety check for an irreversible action. Revalidate the exact persistent
  // Chrome profile immediately before every live click. A failure here is
  // definitely pre-submit, so it is safe to mark failed rather than uncertain.
  if (!dryRun) {
    try {
      const health = await adapter.checkSession(job.accountId);
      await withCtx((ctx) => {
        const previous = ctx.store.sessions.find((session) => session.accountId === job.accountId);
        ctx.store.upsertSession({ accountId: job.accountId, lastOkAt: health.healthy ? health.checkedAt : previous?.lastOkAt ?? null, lastCheckAt: health.checkedAt, healthy: health.healthy, lastScreenshotPath: health.screenshotPath ?? null });
        if (!health.healthy) ctx.store.log({ stage: 'session', level: 'error', msg: 'pre-publish login check failed', dedupeHash: null, latencyMs: null, meta: { accountId: job.accountId, platform: job.platform, detail: health.detail } });
      });
      if (!health.healthy) {
        const detail = `pre-publish session check failed: ${health.detail ?? 'manual login required'}`;
        result = { ok: false, uncertain: false, error: detail, latencyMs: 0 };
        await withCtx((ctx) => finishPost(ctx, job.id, result, dryRun, null));
        return { published: false, detail };
      }
    } catch (e) {
      const detail = `pre-publish session check errored: ${(e as Error).message}`;
      result = { ok: false, uncertain: false, error: detail, latencyMs: 0 };
      await withCtx((ctx) => finishPost(ctx, job.id, result, dryRun, null));
      return { published: false, detail };
    }
  }
  try {
    result = await adapter.publish(request);
  } catch (e) { result = { ok: false, uncertain: true, error: (e as Error).message, latencyMs: 0 }; }
  let archive: string | null = null;
  if (result.ok) {
    try { archive = archivePost({ ...request, compositionId: job.compositionId, sourceUrl, platformPostId: result.platformPostId ?? null, publishedAt: new Date() }); }
    catch (e) { result.error = `published; archive failed: ${(e as Error).message}`; }
  }
  await withCtx((ctx) => finishPost(ctx, job.id, result, dryRun, archive));
  return { published: result.ok, detail: result.error ?? `${dryRun ? 'simulated' : 'published'} ${job.platform}` };
}
