import type { Ctx } from './context.ts';
import { accountForClaim } from './review.ts';
import { claimOf } from './stages/gate.ts';
import { composeClaim } from './stages/compose.ts';
import { brandForVertical } from '@newsroom/brands';
export async function createCarousel(ctx: Ctx, claimIds: string[]) {
  if (!Array.isArray(claimIds) || claimIds.length < 2 || claimIds.length > 6 || new Set(claimIds).size !== claimIds.length) throw new Error('select 2–6 distinct claims');
  const rows = claimIds.map((id) => { const c = ctx.store.getClaim(id); if (!c) throw new Error('claim not found'); return c; });
  if (rows.some((r) => r.vertical !== rows[0]!.vertical)) throw new Error('carousel claims must share a brand');
  if (rows.some((r) => ctx.store.decisions.filter((d) => d.claimId === r.id).at(-1)?.outcome === 'drop')) throw new Error('blocked claims cannot enter a carousel');
  const accountId = accountForClaim(ctx, rows[0]!.id);
  const response = await fetch(`${process.env.RENDERER_URL ?? 'http://127.0.0.1:8787'}/carousel`, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({brand:brandForVertical(rows[0]!.vertical).key,claims:rows.map(claimOf)}), signal:AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(await response.text());
  const out = await response.json() as { images: { path: string }[]; skin: string };
  const first = await composeClaim(ctx, rows[0]!, accountId);
  const { id: _id, ...base } = first;
  const comp = ctx.store.insertComposition({ ...base, imagePaths: out.images.map((x) => x.path), skin: out.skin, createdAt:ctx.now(), renderedAt:ctx.now() });
  // A carousel gets reviewed as a sequence before fan-out. X supports four
  // images; approval of larger sequences targets the other three platforms.
  const review = ctx.store.insertReview({claimId:rows[0]!.id,compositionId:comp.id,state:'pending',rule:'R4',reason:'Carousel sequence requires owner review',createdAt:ctx.now(),expiresAt:new Date(ctx.now().getTime()+90*60000),resolvedAt:null,note:null});
  return {review,composition:comp};
}
