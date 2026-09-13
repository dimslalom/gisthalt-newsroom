'use client';
import { useEffect, useState } from 'react';

interface ReferenceData {
  imageSrc: string; width: number; height: number; archetype: string; layout: string;
  /** Set when this came from an actual pulled claim, not the sample fixture. */
  real: boolean; headline: string | null; caption: string | null;
}

type Stage = 'closed' | 'thumb' | 'full';

/**
 * A random real post from the *exact* archetype/layout currently open in the
 * studio — never a different one from elsewhere in the brand — re-rendered
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

  useEffect(() => {
    if (stage === 'closed') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStage('closed'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

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

      {stage === 'thumb' && (
        <div
          role="dialog" aria-modal="true"
          onClick={() => setStage('closed')}
          style={{ position: 'fixed', inset: 0, zIndex: 899 }}
        >
          <div
            onClick={(e) => { e.stopPropagation(); setStage('full'); }}
            className="card"
            title="Click to enlarge"
            style={{
              position: 'fixed', top: 128, right: 20, zIndex: 900,
              display: 'grid', gap: 6, justifyItems: 'center', padding: 10, cursor: 'zoom-in',
              border: '1px solid var(--line)', background: 'var(--panel)',
              boxShadow: '0 8px 24px color-mix(in srgb, black 45%, transparent)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imageSrc} alt={label} width={displayW} height={displayH}
              style={{ display: 'block', width: displayW, height: displayH, borderRadius: 4, border: '1px solid var(--line)' }}
            />
            <ReferenceCaption data={data} maxWidth={displayW} />
          </div>
        </div>
      )}

      {stage === 'full' && (
        <div
          role="dialog" aria-modal="true"
          onClick={() => setStage('closed')}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'color-mix(in srgb, black 65%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', display: 'grid', gap: 8, justifyItems: 'center',
              background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 16,
              maxWidth: '90vw', maxHeight: '90vh',
            }}
          >
            <button
              type="button"
              onClick={() => setStage('closed')}
              aria-label="Close"
              style={{
                position: 'absolute', top: -14, right: -14, width: 28, height: 28, borderRadius: '50%',
                background: 'var(--fg)', color: 'var(--bg)', border: '1px solid var(--line)',
                display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: 0,
              }}
            >×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imageSrc} alt={label}
              style={{ display: 'block', maxWidth: '80vw', maxHeight: '80vh', width: 'auto', height: 'auto', borderRadius: 4 }}
            />
            <ReferenceCaption data={data} maxWidth={480} />
          </div>
        </div>
      )}
    </>
  );
}

/** Real content gets its own headline + caption; the sample fixture keeps
 *  the old generic label so it's obviously not being passed off as a post. */
function ReferenceCaption({ data, maxWidth }: { data: ReferenceData; maxWidth: number }) {
  if (!data.real) {
    return (
      <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', maxWidth }}>
        Reference: real content in {data.archetype}/{data.layout}
      </span>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 3, maxWidth, textAlign: 'center' }}>
      <span style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
        Real post · {data.archetype}/{data.layout}
      </span>
      {data.headline && <span style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 600 }}>{data.headline}</span>}
      {data.caption && (
        <span style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {data.caption}
        </span>
      )}
    </div>
  );
}
