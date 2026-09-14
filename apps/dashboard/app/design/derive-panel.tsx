'use client';
import { useState } from 'react';

interface DeriveTransform {
  type: 'mirror' | 'photoTo' | 'bodyTo';
  position?: 'left' | 'right' | 'top' | 'full';
  justify?: string; align?: string; textAlign?: string;
}

const REFLOW_PRESETS: Record<string, { justify?: string; align?: string; textAlign?: string }> = {
  none: {},
  'start-left': { justify: 'start', align: 'start', textAlign: 'left' },
  center: { justify: 'center', align: 'center', textAlign: 'center' },
  'end-right': { justify: 'end', align: 'end', textAlign: 'right' },
};

/**
 * Deriving one layout from another; mechanical transforms proposed for
 * review, never applied silently. Preview renders the transformed document
 * through the real renderer before anything is saved; "Use this design" is
 * the only thing that persists it, via the same save path a hand-built
 * document goes through.
 */
export function DerivePanel({
  brand, archetype, targetLayout, fixture, sourceOptions, onClose, onAccepted,
}: {
  brand: string; archetype: string; targetLayout: string; fixture: string;
  sourceOptions: { key: string; label: string; hasDocument: boolean }[];
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [fromLayout, setFromLayout] = useState(sourceOptions.find((s) => s.hasDocument)?.key ?? sourceOptions[0]?.key ?? '');
  const [mirror, setMirror] = useState(true);
  const [photoTo, setPhotoTo] = useState<'' | 'left' | 'right' | 'top' | 'full'>('');
  const [reflow, setReflow] = useState<keyof typeof REFLOW_PRESETS>('none');
  const [preview, setPreview] = useState<{ imageSrc: string; doc: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildTransforms(): DeriveTransform[] {
    const out: DeriveTransform[] = [];
    if (mirror) out.push({ type: 'mirror' });
    if (photoTo) out.push({ type: 'photoTo', position: photoTo });
    if (reflow !== 'none') out.push({ type: 'bodyTo', ...REFLOW_PRESETS[reflow] });
    return out;
  }

  async function runPreview() {
    if (!fromLayout) return;
    setBusy(true); setError(null);
    try {
      const deriveRes = await fetch('/api/layout-doc/derive', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, fromLayout, transforms: buildTransforms() }),
      });
      const deriveJson = await deriveRes.json() as { doc?: unknown; error?: string };
      if (deriveJson.error || !deriveJson.doc) { setError(deriveJson.error ?? 'derive failed'); return; }
      const renderRes = await fetch('/api/render', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, layout: targetLayout, fixture, doc: deriveJson.doc }),
      });
      const renderJson = await renderRes.json() as { url?: string; error?: string };
      if (renderJson.error || !renderJson.url) { setError(renderJson.error ?? 'preview render failed'); return; }
      setPreview({ imageSrc: `/api/render/image?path=${encodeURIComponent(renderJson.url)}`, doc: deriveJson.doc });
    } finally { setBusy(false); }
  }

  async function accept() {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/layout-doc', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, layout: targetLayout, doc: preview.doc }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) { setError(json.error); return; }
      onAccepted();
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 10, marginTop: 6, padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="panel-title" style={{ fontSize: 14 }}>Derive &ldquo;{targetLayout}&rdquo; from…</strong>
        <button type="button" onClick={onClose} style={{ fontSize: 11, padding: '3px 8px' }}>Close</button>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label className="field">Source layout
          <select value={fromLayout} onChange={(e) => { setFromLayout(e.target.value); setPreview(null); }}>
            {sourceOptions.map((s) => <option key={s.key} value={s.key}>{s.label}{s.hasDocument ? '' : ' (built-in template)'}</option>)}
          </select>
        </label>
        <label className="row" style={{ gap: 5, alignSelf: 'end', fontSize: 12 }}>
          <input type="checkbox" checked={mirror} onChange={(e) => { setMirror(e.target.checked); setPreview(null); }} />
          Mirror (left ↔ right)
        </label>
        <label className="field">Move photo to
          <select value={photoTo} onChange={(e) => { setPhotoTo(e.target.value as typeof photoTo); setPreview(null); }}>
            <option value="">unchanged</option>
            <option value="left">left</option>
            <option value="right">right</option>
            <option value="top">top</option>
            <option value="full">full-bleed</option>
          </select>
        </label>
        <label className="field">Reflow body
          <select value={reflow} onChange={(e) => { setReflow(e.target.value as keyof typeof REFLOW_PRESETS); setPreview(null); }}>
            <option value="none">unchanged</option>
            <option value="start-left">start / left</option>
            <option value="center">center</option>
            <option value="end-right">end / right</option>
          </select>
        </label>
        <button type="button" disabled={busy || !fromLayout} onClick={() => void runPreview()} style={{ alignSelf: 'end', fontSize: 12 }}>
          {busy && !preview ? 'Rendering…' : 'Preview'}
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--bad)', margin: 0 }}>{error}</p>}

      {preview && (
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.imageSrc} alt={`Derived preview of ${targetLayout}`} style={{ width: 150, borderRadius: 0, border: '1px solid var(--line)' }} />
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, maxWidth: 280 }}>
              Preview only. Use this design to save it.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="primary" disabled={busy} onClick={() => void accept()} style={{ fontSize: 12 }}>Use this design</button>
              <button type="button" onClick={onClose} style={{ fontSize: 12 }}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
