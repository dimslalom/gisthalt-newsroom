import { getCatalog, rendererFetch, rendererImage, type Catalog } from '../../lib/renderer.ts';
import { DesignStudio } from './studio.tsx';
import { ReferencePreview } from './reference-preview.tsx';

export const dynamic = 'force-dynamic';

interface ReferenceRender { url: string; width: number; height: number; archetype: string; layout: string }

/**
 * One real, currently-certified layout rendered against a real fixture claim
 * (sample news copy + a real photo) — not a placeholder. Purely a reference
 * for whoever is about to design: a reminder of what "real content" looks
 * like in this system before they open a blank-feeling document.
 */
async function getReferenceRender(brand: string, catalog: Catalog): Promise<ReferenceRender | null> {
  const archetype = catalog.archetypes.find((a) => a.key === 'session_result') ?? catalog.archetypes[0];
  const layout = archetype?.layouts[0];
  const fixture = catalog.fixtures.find((f) => f.includes('basic')) ?? catalog.fixtures[0];
  if (!archetype || !layout || !fixture) return null;
  try {
    const out = await rendererFetch<{ url: string; width: number; height: number }>('/render', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, archetype: archetype.key, layout, fixture, skin: catalog.skins[0] }),
    });
    return { ...out, archetype: archetype.key, layout };
  } catch { return null; }
}

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
  const reference = await getReferenceRender(brand, catalog);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <div>
          <h1>Design studio</h1>
          <p className="lede">
            Edit reusable layouts, arrange layers, and link text to claim data. Preview changes before saving.
          </p>
        </div>
        {reference && <ReferencePreview reference={reference} imageSrc={rendererImage(reference.url)} />}
      </div>
      <DesignStudio key={brand} catalog={catalog} />
    </>
  );
}
