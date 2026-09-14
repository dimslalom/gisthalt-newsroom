import { basename } from 'node:path';
import { store } from '../../lib/store.ts';
import { ReviewList } from './review-list.tsx';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ vertical?: string; status?: string }> }) {
  const query = await searchParams;
  const s = await store();
  const now = new Date();
  const items = [...s.reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => {
    const claim = s.getClaim(r.claimId);
    const item = claim ? s.getItem(claim.itemId) : undefined;
    const comp = r.compositionId ? s.getComposition(r.compositionId) : undefined;
    const numbers = claim ? Object.values(claim.values).filter((v) => typeof v === 'number').length : 0;
    return {
      id: r.id,
      rule: r.rule,
      reason: r.reason,
      state: ['pending', 'held'].includes(r.state) && r.expiresAt <= now ? 'expired' : r.state,
      observedAt: claim?.observedAt.toISOString() ?? null,
      note: r.note,
      expiresInMinutes: Math.max(0, Math.round((new Date(r.expiresAt).getTime() - now.getTime()) / 60000)),
      headline: claim?.headline ?? item?.title ?? '(no headline)',
      vertical: claim?.vertical ?? null,
      claimType: claim?.claimType ?? '?',
      tier: claim?.sourceTier ?? '?',
      domain: claim?.sourceDomain ?? '?',
      sourceUrl: item?.rawUrl ?? null,
      quote: claim?.supportingQuote ?? null,
      quoteNote: claim?.supportingQuote ? null : `support found for 0 of ${numbers} numbers`,
      entities: claim?.entities ?? {},
      values: claim?.values ?? {},
      images: (comp?.imagePaths ?? []).map(p=>`/api/render/image?path=${encodeURIComponent(`/renders/${basename(p)}`)}`),
      imageUrl: comp?.imagePaths[0] ? `/api/render/image?path=${encodeURIComponent(`/renders/${basename(comp.imagePaths[0])}`)}` : null,
      captions: comp?.captionByPlatform ?? null,
      compositionId: comp?.id ?? null,
    };
  });
  return <ReviewList items={items} initialVertical={query.vertical} initialStatus={query.status} />;
}
