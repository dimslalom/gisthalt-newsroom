import { getCatalog } from '../../lib/renderer.ts';
import { Worklist } from './worklist.tsx';

export const dynamic = 'force-dynamic';

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const brand = (await searchParams).brand ?? 'f1';
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
        <h1>Design studio</h1>
        <p className="lede">
          Every layout slot this brand can compose, and whether it&apos;s been hand-designed and certified yet.
          Design one, or derive it from a sibling that&apos;s already done.
        </p>
      </div>
      <Worklist key={brand} initialCatalog={catalog} initialBrand={brand} />
    </>
  );
}
