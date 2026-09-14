import { run, type TaskList } from 'graphile-worker';
import { adapters } from '@newsroom/sources';
import { withCtx } from './context.ts';
import { pollSource } from './stages/poll.ts';
import { extractItem } from './stages/extract.ts';
import { gateClaim } from './stages/gate.ts';
import { composeClaim, PLATFORMS } from './stages/compose.ts';
import { enqueuePost } from './stages/publish.ts';
import { accountForClaim, prepareReview, releaseHeldIfCorroborated } from './review.ts';
import { attachResultsCarousel } from './results-carousel.ts';
import { seedAccounts } from './seed.ts';
import { workspaceBrand } from '@newsroom/brands';

export async function startWorkers() {
  if (!process.env.DATABASE_URL) throw new Error('workers require DATABASE_URL; use pnpm pipeline tick for file mode');
  await withCtx(seedAccounts);
  const taskList: TaskList = {
    poll: async (payload) => {
      const { key } = payload as { key: string };
      const out = await withCtx((ctx) => pollSource(ctx, key));
      if (out.error) throw new Error(out.error);
    },
    extract: async (payload) => {
      const { id } = payload as { id: string };
      await withCtx(async (ctx) => { const item = ctx.store.getItem(id); if (item) await extractItem(ctx, item); });
    },
    gate: async (payload) => {
      const { id } = payload as { id: string };
      await withCtx(async (ctx) => {
        const claim = ctx.store.getClaim(id);
        if (!claim || ctx.store.decisions.some((d) => d.claimId === id)) return;
        const outcome = gateClaim(ctx, claim);
        if (outcome.outcome !== 'review') return;
        const review = ctx.store.reviews.find((r) => r.claimId === id && r.state === 'pending');
        if (!review) return;
        await attachResultsCarousel(ctx, claim, review.id).catch((e) =>
          ctx.store.log({ stage: 'review', level: 'warn', msg: 'results carousel attach failed', dedupeHash: claim.dedupeHash, latencyMs: null, meta: { reviewId: review.id, error: (e as Error).message } }));
      });
    },
    compose: async (payload) => {
      const { id } = payload as { id: string };
      const error = await withCtx(async (ctx) => {
        try {
          const claim = ctx.store.getClaim(id);
          if (!claim) return null;
          const comp = await composeClaim(ctx, claim, accountForClaim(ctx, id));
          enqueuePost(ctx, comp, PLATFORMS);
          return null;
        } catch(e) { ctx.store.log({stage:'compose',level:'error',msg:'composition failed; retry pending',dedupeHash:null,latencyMs:null,meta:{claimId:id,error:(e as Error).message}});return (e as Error).message; }
      });
      if(error)throw new Error(error);
    },
    review: async (payload) => {
      const { id } = payload as { id: string };
      await withCtx(async (ctx) => {
        const r = ctx.store.getReview(id);
        if (r && ['pending', 'held'].includes(r.state) && r.expiresAt > ctx.now()) await prepareReview(ctx, id);
      });
    },
    maintain: async () => withCtx(async (ctx) => {
      ctx.store.expireStaleReviews(ctx.now());
      await releaseHeldIfCorroborated(ctx);
      ctx.store.setSetting('workerHeartbeat', ctx.now().toISOString());
    }).then(() => {}),
  };
  const runner = await run({ connectionString: process.env.DATABASE_URL, taskList, concurrency: 3, pollInterval: 1000 });
  let stopping = false;
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => { stopping = true; });
  // Discovery is restart-safe: stage completion is persisted in domain tables.
  // Re-discovery heals a crash between one stage committing and the next enqueue.
  const discover = async () => {
    const pending = await withCtx((ctx) => {
      const now = ctx.now();
      return {
        polls: adapters.filter((a) => {
          const s = ctx.store.getSource(a.key);
          const last = Math.max(s?.lastSuccessAt?.getTime() ?? 0, s?.lastErrorAt?.getTime() ?? 0);
          return s?.active !== false && now.getTime() - last >= a.cadence(now) * 1000;
        }).map((a) => a.key),
        items: ctx.store.items.filter((i) => !ctx.store.extractions.some((e) => e.itemId === i.id)).map((i) => i.id),
        claims: ctx.store.claims.filter((c) => !ctx.store.decisions.some((d) => d.claimId === c.id)).map((c) => c.id),
        autos: ctx.store.claims.filter((c) => ctx.store.decisions.filter((d) => d.claimId === c.id).at(-1)?.outcome === 'auto' &&
          ctx.store.accounts.some(a=>workspaceBrand(ctx.store,a.brand).vertical===c.vertical&&a.active&&!ctx.store.posts.some(p=>p.accountId===a.id&&ctx.store.getComposition(p.compositionId)?.claimId===c.id))).map((c) => c.id),
        reviews: ctx.store.pendingReviews(now).filter((r) => !r.compositionId).map((r) => r.id),
      };
    });
    const add = (task: string, id: string, payload: object) => runner.addJob(task, payload, { jobKey: `${task}:${id}`, jobKeyMode: 'preserve_run_at', maxAttempts: 5 });
    for (const key of pending.polls) await add('poll', key, { key });
    for (const id of pending.items) await add('extract', id, { id });
    for (const id of pending.claims) await add('gate', id, { id });
    for (const id of pending.autos) await add('compose', id, { id });
    for (const id of pending.reviews) await add('review', id, { id });
    await add('maintain', 'heartbeat', {});
  };
  while (!stopping) {
    try { await discover(); } catch (e) { console.error(JSON.stringify({ stage: 'scheduler', error: (e as Error).message })); }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await runner.stop();
}
