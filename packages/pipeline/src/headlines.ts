import { brandForVertical } from '@newsroom/brands';
import { needsHook } from '@newsroom/core';
import { HOOK_TAG, writeHookHeadline } from '@newsroom/llm';
import type { Ctx } from './context.ts';
import { toRawItem } from './stages/extract.ts';

/**
 * Writes the Indonesian hook for prose claims that don't have one yet: the
 * model was offline or quota-limited at extraction, or the claim predates
 * hooks. compose() refuses those claims, so this is what unblocks them.
 * Stops at the first offline answer rather than burning through the list.
 */
export async function ensureHookHeadlines(ctx: Ctx, opts: { limit?: number; claimIds?: string[] } = {}) {
  const wanted = opts.claimIds ? new Set(opts.claimIds) : null;
  const targets = ctx.store.claims
    .filter((c) => needsHook(c) && (!wanted || wanted.has(c.id)))
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .slice(0, opts.limit ?? 10);

  const written: string[] = [];
  const failed: { claimId: string; reason: string }[] = [];
  let offline = false;
  for (const claim of targets) {
    const row = ctx.store.getItem(claim.itemId);
    if (!row) { failed.push({ claimId: claim.id, reason: 'source item missing' }); continue; }
    const brand = brandForVertical(claim.vertical);
    const res = await writeHookHeadline(ctx.router, toRawItem(row), { brandName: brand.name, voiceGuide: brand.voiceGuide });
    if (res.offline) { offline = true; break; }
    if (!res.headline) { failed.push({ claimId: claim.id, reason: res.reason ?? 'rejected' }); continue; }
    claim.headline = res.headline;
    claim.tags = [...claim.tags.filter((t) => t !== HOOK_TAG), HOOK_TAG];
    written.push(claim.id);
  }
  if (written.length) ctx.store.save();
  if (targets.length) {
    ctx.store.log({ stage: 'extract', level: offline || failed.length ? 'warn' : 'info', msg: 'hook headlines written', dedupeHash: null, latencyMs: null, meta: { written: written.length, failed, offline } });
  }
  return { written, failed, offline, pending: ctx.store.claims.filter((c) => needsHook(c)).length };
}
