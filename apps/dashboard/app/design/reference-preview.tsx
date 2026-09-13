'use client';
import { useEffect, useState } from 'react';

export interface ReferenceRender { url: string; width: number; height: number; archetype: string; layout: string }

type Stage = 'closed' | 'thumb' | 'full';

/**
 * A real layout drawn with a real claim's headline, eyebrow and photo — for
 * scale and content-density reference, not part of the page's normal flow.
 * Floats over everything as a small round button; click reveals a floating
 * thumbnail next to it; click that thumbnail to blow it up full-screen.
 */
export function ReferencePreview({ reference, imageSrc }: { reference: ReferenceRender; imageSrc: string }) {
  const [stage, setStage] = useState<Stage>('closed');
  const displayW = 150;
  const displayH = Math.round((reference.height / reference.width) * displayW);
  const label = `Reference render of ${reference.archetype}/${reference.layout} with sample content`;

  useEffect(() => {
    if (stage === 'closed') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStage('closed'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

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
          boxShadow: '0 2px 10px color-mix(in srgb, black 35%, transparent)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="" width={44} height={44} style={{ display: 'block', width: 44, height: 44, objectFit: 'cover' }} />
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
              src={imageSrc} alt={label} width={displayW} height={displayH}
              style={{ display: 'block', width: displayW, height: displayH, borderRadius: 4, border: '1px solid var(--line)' }}
            />
            <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', maxWidth: displayW }}>
              Reference: real content in {reference.archetype}/{reference.layout}
            </span>
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
              src={imageSrc} alt={label}
              style={{ display: 'block', maxWidth: '80vw', maxHeight: '80vh', width: 'auto', height: 'auto', borderRadius: 4 }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Reference: real content in {reference.archetype}/{reference.layout}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
