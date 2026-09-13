import { getCatalog } from '../../lib/renderer.ts';
import { DesignStudio } from './studio.tsx';

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
          Edit reusable layouts, arrange layers, and link text to claim data. Preview changes before saving.
        </p>
      </div>
      <DesignStudio key={brand} catalog={catalog} />
    </>
  );
}
