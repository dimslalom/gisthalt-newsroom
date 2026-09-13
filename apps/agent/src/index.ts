import { adapterFor } from '@newsroom/publish';
import { withCtx, publishNext } from '@newsroom/pipeline';
import { closeDatabase } from '@newsroom/db';
let stopping = false;
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => { stopping = true; });
let lastSessionCheck = 0;
const boundedMs = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};
const sessionCheckMs = boundedMs(process.env.AGENT_SESSION_CHECK_MS, 300_000, 10_000, 3_600_000);
const pollMs = boundedMs(process.env.AGENT_POLL_MS, 5_000, 1_000, 60_000);
while (!stopping) {
  try {
    await withCtx((ctx) => ctx.store.setSetting('agentHeartbeat', ctx.now().toISOString()));
    if (Date.now() - lastSessionCheck > sessionCheckMs) {
      const accounts = await withCtx((ctx) => ctx.store.accounts.filter((a) => a.active));
      for (const account of accounts) {
        const health = await adapterFor(account.platform).checkSession(account.id);
        await withCtx((ctx) => {
          ctx.store.upsertSession({ accountId: account.id, lastOkAt: health.healthy ? health.checkedAt : ctx.store.sessions.find((s) => s.accountId === account.id)?.lastOkAt ?? null,
            lastCheckAt: health.checkedAt, healthy: health.healthy, lastScreenshotPath: health.screenshotPath ?? null });
          if (!health.healthy) ctx.store.log({ stage: 'session', level: 'error', msg: 'manual login required', dedupeHash: null, latencyMs: null, meta: { accountId: account.id, detail: health.detail } });
        });
      }
      lastSessionCheck = Date.now();
    }
    await publishNext();
  } catch (e) { console.error(JSON.stringify({ stage: 'agent', error: (e as Error).message })); }
  await new Promise((r) => setTimeout(r, pollMs));
}
await closeDatabase();
