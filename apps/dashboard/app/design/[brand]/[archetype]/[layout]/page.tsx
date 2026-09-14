import Link from 'next/link';
import { getCatalog } from '../../../../../lib/renderer.ts';
import { DesignStudio } from '../../../studio.tsx';

export const dynamic = 'force-dynamic';

export default async function StudioPage({ params }: { params: Promise<{ brand: string; archetype: string; layout: string }> }) {
  const { brand, archetype, layout } = await params;
  const catalog = await getCatalog(brand);
  if (!catalog) {
    return (
      <>
        <h1>Design studio</h1>
        <div className="empty">
          The renderer is not answering.<br />
          Start it with <code>pnpm renderer</code>, then reload to see layout previews.
        </div>
      </>
    );
  }
  return (
    <>
      <div>
        <Link href="/design" style={{ fontSize: 12, color: 'var(--muted)' }}>← Back to worklist</Link>
        <h1 style={{ marginTop: 6 }}>Design studio</h1>
        <p className="lede">
          Edit reusable layouts, arrange layers, and link text to claim data. Preview changes before saving.
        </p>
      </div>
      <DesignStudio key={`${brand}/${archetype}/${layout}`} catalog={catalog} initial={{ brand, archetype, layout }} />
    </>
  );
}
