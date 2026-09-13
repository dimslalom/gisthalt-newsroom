import { getCatalog } from '../../lib/renderer.ts';
import { Lab } from './lab.tsx';

export const dynamic = 'force-dynamic';

export default async function LabPage({searchParams}:{searchParams:Promise<{brand?:string}>}) {
  const brand = (await searchParams).brand ?? 'f1';
  const catalog = await getCatalog(brand);
  if (!catalog) {
    return (
      <>
        <h1>Template lab</h1>
        <div className="empty">
          The renderer is not answering.<br />
          Start it with <code>pnpm renderer</code>, then reload to see layout previews.
        </div>
      </>
    );
  }
  return <Lab key={brand} catalog={catalog} brand={brand} />;
}
