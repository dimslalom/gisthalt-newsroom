'use client';
import { Modal } from '../modal.tsx';
import { useEffect, useState } from 'react';

interface ReferenceData {
  imageSrc: string; width: number; height: number; archetype: string; layout: string;
  /** Set when this came from an actual pulled claim, not the sample fixture. */
  real: boolean; headline: string | null; caption: string | null;
}

type Stage = 'closed' | 'thumb' | 'full';

/**
 * A random real post from the *exact* archetype/layout currently open in the
 * studio; never a different one from elsewhere in the brand; re-rendered
 * fresh through today's design. Refetches whenever the studio's
 * archetype/layout selection changes, so it always tracks what's on screen.
 * Floats over everything as a small round button, not part of the page's
 * normal flow; click reveals a floating thumbnail next to it; click that
 * thumbnail to blow it up full-screen.
 */
export function ReferencePreview({ brand, archetype, layout }: { brand: string; archetype: string; layout: string }) {
  const [stage, setStage] = useState<Stage>('closed');
  const [data, setData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!archetype || !layout) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/design-reference?brand=${encodeURIComponent(brand)}&archetype=${encodeURIComponent(archetype)}&layout=${encodeURIComponent(layout)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: ReferenceData & { error?: string }) => { if (!cancelled && !json.error) setData(json); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brand, archetype, layout]);

  // Nothing to float until the first fetch for this archetype/layout resolves.
  if (!data || data.archetype !== archetype || data.layout !== layout) return null;

  const displayW = 150;
  const displayH = Math.round((data.height / data.width) * displayW);
  const label = data.real
    ? `Reference render of a real post: ${data.headline ?? `${data.archetype}/${data.layout}`}`
    : `Reference render of ${data.archetype}/${data.layout} with sample content`;

  return (
    <>
      <button
        type="button"
        onClick={() => setStage((s) => (s === 'closed' ? 'thumb' : 'closed'))}
        title="Reference render"
        aria-label="Reference render"
        style={{
          position: 'fixed', top: 76, right: 20, zIndex: 900,
          width: 44, height: 44, borderRadius: '50%', padding: 0, overflow: 'hidden',
          border: '1px solid var(--line)', background: 'var(--panel)', cursor: 'pointer',
          opacity: loading ? 0.6 : 1, transition: 'opacity .2s ease',
          boxShadow: '0 2px 10px color-mix(in srgb, black 35%, transparent)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.imageSrc} alt="" width={44} height={44} style={{ display: 'block', width: 44, height: 44, objectFit: 'cover' }} />
      </button>

      {stage !== 'closed' && (
        <Modal label="Reference render" className={stage === 'thumb' ? 'reference-thumb-modal' : 'reference-full-modal'} onDismiss={() => setStage('closed')}>
          <div className="card reference-content">
            <button type="button" onClick={() => setStage('closed')} aria-label="Close" className="reference-close">Close</button>
            {stage === 'thumb' ? <button type="button" title="Click to enlarge" aria-label="Enlarge reference" className="reference-enlarge" onClick={() => setStage('full')}>
              <img src={data.imageSrc} alt={label} width={displayW} height={displayH} />
            </button> : <img className="reference-full-image" src={data.imageSrc} alt={label} />}
            <ReferenceCaption data={data} maxWidth={stage === 'thumb' ? displayW : 480} />
          </div>
        </Modal>
      )}
    </>
  );
}

/** A real post gets its own headline + caption. The sample-fixture case is
 *  labelled explicitly as such; it's a real photo, not a placeholder, but
 *  it is NOT an actual post, and saying otherwise here once read as a lie. */
function ReferenceCaption({ data, maxWidth }: { data: ReferenceData; maxWidth: number }) {
  return <div style={{ display: 'grid', gap: 4, maxWidth }}>
    <div className="metadata"><span>{data.real ? 'Real post' : 'Sample fixture'}</span><span>{data.archetype}</span><span>{data.layout}</span></div>
    {!data.real && <span className="metadata">No real post yet</span>}
    {data.real && data.headline && <span className="panel-title" style={{ fontSize: 14 }}>{data.headline}</span>}
    {data.real && data.caption && <span className="metadata" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{data.caption}</span>}
  </div>;
}
