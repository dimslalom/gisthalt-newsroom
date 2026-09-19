// Writes the Indonesian hook headline for every prose claim that lacks one,
// then refreshes every composition's headline, captions and artwork (structured
// claims build new data-driven hooks too, so all of them change).
//
// Model calls and renders run against a lock-free snapshot; only the results
// are committed under the store's write lock, in small batches, so this never
// queues behind (or blocks) the workers for longer than a quick write.
// Needs GEMINI_API_KEY. Safe to re-run: claims that already have a hook are skipped.
//   --dry-run   report what would change, call nothing
import { readStore, Store } from '@newsroom/db';
import { needsHook } from '@newsroom/core';
import { brandForVertical } from '@newsroom/brands';
import { checkHookHeadline, GeminiRouter, HOOK_TAG, writeHookHeadline } from '@newsroom/llm';
import { contextFor, prepareRefresh, toRawItem, withCtx } from '@newsroom/pipeline';

const dryRun = process.argv.includes('--dry-run');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OFFLINE_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

// Hooks written under older, looser rules are re-checked against the current
// ones; any that fail lose their tag and are written again below.
const before = await readStore();
const stale = before.claims.filter((c) => {
  if (!c.tags.includes(HOOK_TAG)) return false;
  const row = before.getItem(c.itemId);
  return !row || checkHookHeadline(c.headline, row) !== null;
});
console.log(`${stale.length} existing hooks fail the current rules${stale.length ? `: ${stale.map((c) => JSON.stringify(c.headline)).join(', ')}` : ''}`);
if (stale.length && !dryRun) {
  await withCtx((ctx) => {
    for (const { id } of stale) {
      const claim = ctx.store.getClaim(id);
      if (claim) claim.tags = claim.tags.filter((t) => t !== HOOK_TAG);
    }
    ctx.store.save();
  });
}

const snapshot = await readStore();
const pending = snapshot.claims.filter((c) => needsHook(c));
console.log(`${pending.length} claims need a hook; ${snapshot.compositions.length} compositions will be refreshed${dryRun ? ' (dry run)' : ''}`);
if (dryRun) process.exit(0);

// ---- hooks ---------------------------------------------------------------
// A private in-memory store backs the router's usage counters and cache, so a
// model call never touches the shared store. Pacing keeps us under Flash-Lite's
// 30 rpm free tier (up to 3 attempts per claim).
const router = new GeminiRouter(new Store());
const hooks = new Map<string, string>();
const rejected: { claimId: string; reason: string }[] = [];
const commitHooks = async () => {
  if (!hooks.size) return;
  const batch = new Map(hooks); hooks.clear();
  await withCtx((ctx) => {
    for (const [id, headline] of batch) {
      const claim = ctx.store.getClaim(id);
      if (!claim || !needsHook(claim)) continue;
      claim.headline = headline;
      claim.tags = [...claim.tags, HOOK_TAG];
    }
    ctx.store.save();
  });
  written += batch.size;
  console.log(`hooks: ${written} written, ${rejected.length} without a valid hook`);
};
let written = 0;
let offline = false;
for (const claim of pending) {
  const row = snapshot.getItem(claim.itemId);
  if (!row) { rejected.push({ claimId: claim.id, reason: 'source item missing' }); continue; }
  const brand = brandForVertical(claim.vertical);
  // Demand spikes pass; wait them out on this claim before giving up the run.
  let res = await writeHookHeadline(router, toRawItem(row), { brandName: brand.name, voiceGuide: brand.voiceGuide });
  for (let wait = 0; res.offline && wait < OFFLINE_BACKOFF_MS.length; wait++) {
    console.log(`model busy; retrying in ${OFFLINE_BACKOFF_MS[wait]! / 1000}s`);
    await sleep(OFFLINE_BACKOFF_MS[wait]!);
    res = await writeHookHeadline(router, toRawItem(row), { brandName: brand.name, voiceGuide: brand.voiceGuide });
  }
  if (res.offline) { offline = true; console.error('model offline or out of budget; stopping hooks. Re-run later to continue.'); break; }
  if (res.headline) hooks.set(claim.id, res.headline);
  else rejected.push({ claimId: claim.id, reason: res.reason ?? 'rejected' });
  if (hooks.size >= 10) await commitHooks();
  await sleep(2500);
}
await commitHooks();
for (const r of rejected) console.error(JSON.stringify(r));

// ---- compositions --------------------------------------------------------
// Re-read so the refresh sees the hooks just committed.
const fresh = await readStore();
const readCtx = contextFor(fresh);
// Workers hold the write lock for up to a minute per poll, so committing one
// composition per lock took hours. Render outside the lock, commit in batches.
let refreshed = 0;
const errors: { id: string; error: string }[] = [];
const patches = new Map<string, Awaited<ReturnType<typeof prepareRefresh>>>();
const commitPatches = async () => {
  if (!patches.size) return;
  const batch = new Map(patches); patches.clear();
  await withCtx((ctx) => {
    for (const [id, patch] of batch) ctx.store.updateComposition(id, patch);
    ctx.store.save();
  });
  refreshed += batch.size;
  console.log(`compositions: ${refreshed} refreshed, ${errors.length} not refreshed`);
};
// --only-invalid-skins: just the compositions whose stored skin their brand no
// longer offers (e.g. the photo-less 'archival' skin retired from film/vct).
const onlyInvalidSkins = process.argv.includes('--only-invalid-skins');
const targets = fresh.compositions.filter((comp) => {
  if (!onlyInvalidSkins) return true;
  const claim = fresh.getClaim(comp.claimId);
  return claim ? !brandForVertical(claim.vertical).skins.some((s) => s.key === comp.skin) : false;
});
if (onlyInvalidSkins) console.log(`${targets.length} compositions use a retired skin`);
for (const comp of targets) {
  try { patches.set(comp.id, await prepareRefresh(readCtx, comp.id)); }
  catch (e) { errors.push({ id: comp.id, error: (e as Error).message }); }
  if (patches.size >= 25) await commitPatches();
}
await commitPatches();
const reasons = new Map<string, number>();
for (const e of errors) reasons.set(e.error, (reasons.get(e.error) ?? 0) + 1);
console.log(`compositions: ${refreshed} refreshed, ${errors.length} not refreshed`);
for (const [reason, n] of reasons) console.log(`  ${n} × ${reason}`);
console.log(`hooks: ${written} written, ${rejected.length} without a valid hook${offline ? ' (stopped early: model offline)' : ''}`);
process.exit(0);
