import { withCtx, tick, pollSource, publishNext, seedAccounts } from '@newsroom/pipeline';
import { closeDatabase } from '@newsroom/db';
const [command, ...args] = process.argv.slice(2);
try {
  const out = command === 'publish' ? await publishNext() : await withCtx(async (ctx) => {
    seedAccounts(ctx);
    switch (command) {
      case 'tick': return tick(ctx);
      case 'poll': return args.length ? Promise.all(args.map((key) => pollSource(ctx, key))) : tick(ctx, { render: false });
      case 'status': return { items: ctx.store.items.length, claims: ctx.store.claims.length, compositions: ctx.store.compositions.length, posts: ctx.store.posts, reviews: ctx.store.pendingReviews(ctx.now()), sources: ctx.store.sources };
      default: return 'usage: pnpm pipeline <tick|poll [source...]|publish|status>; pnpm workers starts the durable scheduler';
    }
  });
  console.log(JSON.stringify(out, null, 2));
} finally { await closeDatabase(); }
