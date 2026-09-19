// Rewrites every stored claim whose claimType no archetype of its brand lists
// (e.g. an F1 claim the model called 'release') to 'article', the type every
// brand's quote-style archetype accepts. Those claims fail compose/review with
// NoArchetypeError on every retry; once repaired, the workers' discovery loop
// re-enqueues their pending reviews and prepares them normally.
//
// The dedupe hash is recomputed so a later outlet reporting the same story
// still corroborates it, and the claim's evidence rows move with it. If another
// claim already holds the new hash, the old hash is kept rather than colliding.
// Safe to re-run: repaired claims no longer match.
//   --dry-run   report what would change, write nothing
import { dedupeHash } from '@newsroom/core';
import { brandForVertical } from '@newsroom/brands';
import { brandRendersClaimType, withCtx } from '@newsroom/pipeline';

const dryRun = process.argv.includes('--dry-run');

const result = await withCtx((ctx) => {
  const stuck = ctx.store.claims.filter((c) => !brandRendersClaimType(brandForVertical(c.vertical), c.claimType));
  const rehashed: string[] = [];
  const keptHash: string[] = [];
  for (const c of stuck) {
    console.log(`${c.id} ${c.vertical} ${c.claimType} -> article${dryRun ? ' (dry run)' : ''}`);
    if (dryRun) continue;
    const oldHash = c.dedupeHash;
    c.claimType = 'article';
    const hash = dedupeHash(c);
    if (hash === oldHash) continue;
    if (ctx.store.claims.some((o) => o.id !== c.id && o.dedupeHash === hash)) { keptHash.push(c.id); continue; }
    c.dedupeHash = hash;
    for (const e of ctx.store.evidence) if (e.dedupeHash === oldHash) e.dedupeHash = hash;
    rehashed.push(c.id);
  }
  if (stuck.length && !dryRun) {
    ctx.store.log({ stage: 'extract', level: 'info', msg: 'repaired claim types with no archetype', dedupeHash: null, latencyMs: null, meta: { claimIds: stuck.map((c) => c.id), rehashed: rehashed.length, keptHash } });
    ctx.store.save();
  }
  return { repaired: stuck.length, rehashed: rehashed.length, keptHash: keptHash.length };
});

console.log(`${result.repaired} claims ${dryRun ? 'would be' : ''} repaired; ${result.rehashed} rehashed, ${result.keptHash} kept their old hash (another claim already holds the article hash)`);
process.exit(0);
