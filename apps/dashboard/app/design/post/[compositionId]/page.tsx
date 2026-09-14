import Link from 'next/link';
import { brandForVertical } from '@newsroom/brands';
import { getCatalog } from '../../../../lib/renderer.ts';
import { store } from '../../../../lib/store.ts';
import { DesignStudio } from '../../studio.tsx';

export const dynamic = 'force-dynamic';

export default async function PostDesignPage({ params }: { params: Promise<{ compositionId: string }> }) {
  const { compositionId } = await params;
  const s = await store();
  const comp = s.getComposition(compositionId);
  const row = comp ? s.getClaim(comp.claimId) : undefined;
  if (!comp || !row) {
    return (
      <>
        <Link href="/review" style={{ fontSize: 12, color: 'var(--muted)' }}>← Back to review</Link>
        <h1 style={{ marginTop: 6 }}>Post not found</h1>
      </>
    );
  }
  const brand = brandForVertical(row.vertical).key;
  const catalog = await getCatalog(brand);
  if (!catalog) {
    return (
      <>
        <h1>Post design</h1>
        <div className="empty">The renderer is not answering. Start it, then reload.</div>
      </>
    );
  }
  return (
    <>
      <div>
        <Link href="/review" style={{ fontSize: 12, color: 'var(--muted)' }}>← Back to review</Link>
        <h1 style={{ marginTop: 6 }}>Post design</h1>
        <p className="lede">
          Edit this post, then save and download the artwork using the controls below.
        </p>
      </div>
      <DesignStudio
        key={compositionId}
        catalog={catalog}
        initial={{ brand, archetype: comp.archetype, layout: comp.layout }}
        postId={compositionId}
      />
    </>
  );
}
