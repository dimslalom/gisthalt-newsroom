// Re-renders past compositions in the current house style (doc-minimal.ts):
// clears their accents and any per-post design, then renders from the layout's
// shared document. Never touches a composition with a live or unresolved
// publication (savePostDesign refuses those), and skips carousels.
import { readStore } from '@newsroom/db';
import { savePostDesign, withCtx } from '@newsroom/pipeline';

const dryRun = process.argv.includes('--dry-run');
const LOCKED = ['publishing', 'uncertain', 'published', 'retraction_requested', 'retracted'];

const snapshot = await readStore();
const targets = snapshot.compositions.filter((c) =>
  c.imagePaths.length <= 1
  && !snapshot.posts.some((p) => p.compositionId === c.id && LOCKED.includes(p.status)));
console.log(`${targets.length}/${snapshot.compositions.length} compositions to restyle${dryRun ? ' (dry run)' : ''}`);
if (dryRun) process.exit(0);

await withCtx((ctx) => {
  for (const c of targets) ctx.store.updateComposition(c.id, { accents: [], doc: null });
});

let ok = 0;
const errors: { id: string; error: string }[] = [];
for (const [i, c] of targets.entries()) {
  try { await savePostDesign(c.id, null); ok++; }
  catch (e) { errors.push({ id: c.id, error: (e as Error).message }); }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${targets.length}`);
}
for (const e of errors) console.error(JSON.stringify(e));
console.log(`restyled ${ok}/${targets.length}, ${errors.length} failed`);
process.exit(errors.length ? 1 : 0);
