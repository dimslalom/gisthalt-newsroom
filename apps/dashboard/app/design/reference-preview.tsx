'use client';
import { useEffect, useState } from 'react';

export interface ReferenceRender { url: string; width: number; height: number; archetype: string; layout: string }

/** A small, non-interactive-looking reference card: a real layout drawn with
 *  a real claim's headline, eyebrow and photo — for scale and content-density
 *  reference only. Clicking it opens the same render full-size in a floating,
 *  closable popup, since 150px is too small to actually read at a glance. */
export function ReferencePreview({ reference, imageSrc }: { reference: ReferenceRender; imageSrc: string }) {
  const [open, setOpen] = useState(false);
  const displayW = 150;
  const displayH = Math.round((reference.height / reference.width) * displayW);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        className="card"
        style={{
          display: 'grid', gap: 6, justifyItems: 'center', padding: 10, flex: '0 0 auto',
          cursor: 'zoom-in', border: '1px solid var(--line)', background: 'var(--panel)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={`Reference render of ${reference.archetype}/${reference.layout} with sample content`}
          width={displayW}
          height={displayH}
          style={{ display: 'block', width: displayW, height: displayH, borderRadius: 4, border: '1px solid var(--line)' }}
        />
        <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', maxWidth: displayW }}>
          Reference: real content in {reference.archetype}/{reference.layout}
        </span>
      </button>

      {open && (
        <div
          role="dialog" aria-modal="true"
          onClick={() => setOpen(false)}
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
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: 'absolute', top: -14, right: -14, width: 28, height: 28, borderRadius: '50%',
                background: 'var(--fg)', color: 'var(--bg)', border: '1px solid var(--line)',
                display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: 0,
              }}
            >×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={`Reference render of ${reference.archetype}/${reference.layout} with sample content`}
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
