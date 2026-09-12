import { contentHash, preExtractionKey } from '@newsroom/core';
import { adapters, adapterByKey } from '@newsroom/sources';
import type { Ctx } from '../context.ts';

export interface PollSummary { source: string; fetched: number; inserted: number; deduped: number; error?: string }

/**
 * Stage 1. Fetch, hash, insert. Dedupe runs here — before extraction — so one
 * race result arriving from four sources costs at most one model call.
 */
export async function pollSource(ctx: Ctx, key: string): Promise<PollSummary> {
  const adapter = adapterByKey(key);
  if (!adapter) return { source: key, fetched: 0, inserted: 0, deduped: 0, error: 'unknown source' };
  const now = ctx.now();
  const record = ctx.store.getSource(key);
  if (record?.active === false) return {source:key,fetched:0,inserted:0,deduped:0};

  try {
    const items = await adapter.poll({
      now,
      cursor: record?.cursor ?? null,
      fetch,
      log: (msg, meta) => ctx.store.log({ stage: 'poll', level: 'info', msg, meta: { source: key, ...meta }, dedupeHash: null, latencyMs: null }),
    });

    let inserted = 0;
    let deduped = 0;
    for (const item of items) {
      const row = ctx.store.insertItem({
        sourceKey: item.sourceKey,
        externalId: item.externalId,
        fetchedAt: now,
        observedAt: item.observedAt,
        payload: item.payload,
        contentHash: contentHash(item),
        preKey: preExtractionKey(item),
        vertical: item.vertical,
        tier: item.tier,
        sourceDomain: item.sourceDomain,
        rawUrl: item.rawUrl,
        title: item.title,
        body: item.body,
        imageUrl: item.imageUrl ?? null,
      });
      if (row) inserted += 1; else deduped += 1;
    }

    ctx.store.upsertSource({
      key, vertical: adapter.vertical, tier: adapter.tier, cadenceSeconds: adapter.cadence(now),
      lastSuccessAt: now, lastErrorAt: record?.lastErrorAt ?? null, lastError: null,
      itemsSeen: (record?.itemsSeen ?? 0) + inserted, cursor: record?.cursor ?? null, active: true,
    });
    ctx.store.log({ stage: 'poll', level: 'info', msg: 'polled', dedupeHash: null, latencyMs: null, meta: { source: key, fetched: items.length, inserted, deduped } });
    return { source: key, fetched: items.length, inserted, deduped };
  } catch (e) {
    const msg = (e as Error).message;
    ctx.store.upsertSource({
      key, vertical: adapter.vertical, tier: adapter.tier, cadenceSeconds: adapter.cadence(now),
      lastSuccessAt: record?.lastSuccessAt ?? null, lastErrorAt: now, lastError: msg,
      itemsSeen: record?.itemsSeen ?? 0, cursor: record?.cursor ?? null, active: true,
    });
    // A parse failure must page you, never silently produce empty posts.
    ctx.store.log({ stage: 'poll', level: 'error', msg: 'poll failed', dedupeHash: null, latencyMs: null, meta: { source: key, error: msg } });
    return { source: key, fetched: 0, inserted: 0, deduped: 0, error: msg };
  }
}

export async function pollDue(ctx: Ctx): Promise<PollSummary[]> {
  const now = ctx.now();
  const out: PollSummary[] = [];
  for (const a of adapters) {
    const rec = ctx.store.getSource(a.key);
    if (rec?.active === false) continue;
    const lastAttempt = rec?.lastErrorAt && (!rec.lastSuccessAt || rec.lastErrorAt > rec.lastSuccessAt) ? rec.lastErrorAt : rec?.lastSuccessAt;
    const due = !lastAttempt || now.getTime() - lastAttempt.getTime() >= a.cadence(now) * 1000;
    if (due) out.push(await pollSource(ctx, a.key));
  }
  return out;
}
