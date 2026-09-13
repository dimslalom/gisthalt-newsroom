'use client';
import { useEffect, useState } from 'react';
import { useWidth } from '../use-width';
import type { Catalog } from '../../lib/renderer.ts';
import { BoundingBoxEditor, ElementInspector, type ElementRect, type ElementTransform, type LayoutOverride } from './editor.tsx';

const ACCENTS = ['diagonal', 'halftone', 'grain', 'ticker', 'watermark', 'cropmarks'];

interface RenderResponse {
  url?: string; ms?: number; error?: string;
  guards?: { logo: string; headlineOverflowed: boolean; fittedPx: string | null; fontsPinned: boolean;
             treatment: { scrim: number; colour: string; overImage: boolean } | null };
  spec?: { archetype: string; layout: string; skin: string; accents: string[] };
  elements?: ElementRect[];
}

/**
 * Layouts position content with CSS Grid/Flex alignment and sized boxes, not
 * literal x/y; so the canvas below edits a translate+scale nudge from each
 * element's own computed position, not free placement. That's deliberate: a
 * truly free x/y would let a saved override defeat the guards (fitText,
 * contrast, logo placement) that keep unattended posting safe. Content still
 * flows and fits normally underneath every box you drag.
 */
function LayoutEditorPanel({
  brand, archetype, layout, elements, imageUrl, displayWidth, onSaved,
}: {
  brand: string; archetype: string; layout: string; elements: ElementRect[];
  imageUrl: string; displayWidth: number; onSaved: () => void;
}) {
  const [override, setOverride] = useState<LayoutOverride>({});
  const [saved, setSaved] = useState<LayoutOverride>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setJustSaved(false);
    setSelected(null);
    fetch(`/api/layout-override?brand=${brand}&archetype=${archetype}&layout=${layout}`)
      .then((r) => r.json()).then((b) => { setOverride(b.override ?? {}); setSaved(b.override ?? {}); })
      .catch(() => { setOverride({}); setSaved({}); });
  }, [brand, archetype, layout]);

  const dirty = JSON.stringify(override) !== JSON.stringify(saved);
  const set = <K extends keyof LayoutOverride>(k: K, v: LayoutOverride[K]) => setOverride((o) => ({ ...o, [k]: v }));
  const num = (k: keyof LayoutOverride, v: string) => set(k, (v === '' ? undefined : Number(v)) as never);

  function setElementTransform(name: string, t: ElementTransform) {
    setOverride((o) => {
      const els = { ...(o.elements ?? {}) };
      const isDefault = !t.x && !t.y && (t.scale === undefined || t.scale === 1);
      if (isDefault) delete els[name]; else els[name] = t;
      return { ...o, elements: els };
    });
  }

  async function save() {
    setBusy(true);
    try {
      const r = await fetch('/api/layout-override', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, layout, patch: override }),
      });
      const body = await r.json();
      setOverride(body.override); setSaved(body.override); setJustSaved(true);
      onSaved();
    } finally { setBusy(false); }
  }

  async function reset() {
    setBusy(true);
    try {
      await fetch('/api/layout-override?clear=1', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, layout }),
      });
      setOverride({}); setSaved({}); setSelected(null); setJustSaved(true);
      onSaved();
    } finally { setBusy(false); }
  }

  const viewer = useWidth(displayWidth);
  const fittedWidth = displayWidth === 1080 ? 1080 : Math.min(displayWidth, viewer.width);
  const hasSaved = Object.keys(saved).length > 0;

  return (
    <div className="lab-workspace">
      <div className="lab-viewer">
        <div className="canvas-scroll" ref={viewer.ref}>
        <div className="art-frame" style={{ width: fittedWidth }}>
          <BoundingBoxEditor
            imageUrl={imageUrl}
            elements={elements}
            override={override}
            savedElements={saved.elements}
            displayWidth={fittedWidth}
            selected={selected}
            onSelect={setSelected}
            onChange={(els) => setOverride((o) => ({ ...o, elements: els }))}
          />
        </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Click a box to select it, drag its body to move it, drag the corner handle to resize.
        </p>
      </div>

      <div className="grid" style={{ gap: 14 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Selected element</h2>
            {hasSaved && <span className="tag" style={{ color: 'var(--accent)' }}>override saved</span>}
          </div>
          <div style={{ marginTop: 10 }}>
            <ElementInspector
              name={selected}
              transform={selected ? override.elements?.[selected] : undefined}
              onChange={(t) => selected && setElementTransform(selected, t)}
              onReset={() => selected && setElementTransform(selected, {})}
            />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Layout-wide adjustments</h2>
          <p className="lede" style={{ marginTop: 4, marginBottom: 12, fontSize: 12 }}>
            These and every element position above apply to <strong>every</strong> post using this
            archetype + layout; a brand-level save, not a one-off tweak to a single post.
          </p>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field">Padding (px)
              <input type="number" min={16} max={160} placeholder="brand default"
                value={override.padding ?? ''} onChange={(e) => num('padding', e.target.value)} />
            </label>
            <label className="field">Spacing unit (px)
              <input type="number" min={4} max={32} placeholder="brand default"
                value={override.spacingUnit ?? ''} onChange={(e) => num('spacingUnit', e.target.value)} />
            </label>
            <label className="field">Headline min (px)
              <input type="number" min={16} max={200} placeholder="34"
                value={override.headlineMinPx ?? ''} onChange={(e) => num('headlineMinPx', e.target.value)} />
            </label>
            <label className="field">Headline max (px)
              <input type="number" min={24} max={320} placeholder="brand default"
                value={override.headlineMaxPx ?? ''} onChange={(e) => num('headlineMaxPx', e.target.value)} />
            </label>
            <label className="field">Vertical anchor
              <select value={override.bodyAlign ?? ''} onChange={(e) => set('bodyAlign', (e.target.value || undefined) as never)}>
                <option value="">layout default</option>
                <option value="start">top</option>
                <option value="center">middle</option>
                <option value="end">bottom</option>
              </select>
            </label>
            <label className="field">Text align
              <select value={override.textAlign ?? ''} onChange={(e) => set('textAlign', (e.target.value || undefined) as never)}>
                <option value="">layout default</option>
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
          </div>
        </div>

        <div className="row">
          <button className="primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save & re-render'}</button>
          <button disabled={busy || !hasSaved} onClick={reset}>Reset this layout to brand default</button>
          {justSaved && !dirty && <span className="tag" style={{ color: 'var(--good)' }}>saved</span>}
        </div>
      </div>
    </div>
  );
}

export function Lab({ catalog, brand }: { catalog: Catalog; brand: string }) {
  const [fixture, setFixture] = useState(catalog.fixtures[0] ?? '');
  const [archetype, setArchetype] = useState(catalog.archetypes[0]?.key ?? '');
  const [layout, setLayout] = useState(catalog.archetypes[0]?.layouts[0] ?? '');
  const [skin, setSkin] = useState('dark');
  const [accents, setAccents] = useState<string[]>([]);
  const [res, setRes] = useState<RenderResponse | null>(null);
  const [variants, setVariants] = useState<(RenderResponse & { layout: string; skin: string; accents: string[] })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [size, setSize] = useState<'true' | 'feed'>('feed');

  const layouts = catalog.archetypes.find((a) => a.key === archetype)?.layouts ?? [];
  useEffect(() => { if (!layouts.includes(layout)) setLayout(layouts[0] ?? ''); }, [archetype]); // eslint-disable-line

  async function render() {
    setBusy(true); setVariants(null);
    try {
      const r = await fetch('/api/render', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, fixture, archetype, layout, skin, accents }),
      });
      setRes(await r.json());
    } finally { setBusy(false); }
  }

  async function renderAll() {
    setBusy(true); setRes(null);
    try {
      const all: NonNullable<typeof variants> = [];
      let offset = 0; let total = Infinity;
      while (offset < total) {
        const r = await fetch('/api/variants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({brand,fixture,archetype,limit:20,offset}) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? 'variant render failed');
        all.push(...body.results); total = body.total; offset = body.nextOffset;
        setVariants([...all]); setProgress(`${offset}/${total}`);
        if (!body.results.length) break;
      }
    } catch (e) { setRes({error:(e as Error).message});
    } finally { setBusy(false); }
  }

  useEffect(() => { void render(); }, []); // eslint-disable-line

  const img = (u?: string) => (u ? `/api/render/image?path=${encodeURIComponent(u)}` : '');
  const displayWidth = size === 'true' ? 1080 : 360;

  return (
    <>
      <h1>Template lab</h1>
      <p className="lede">
        Check layouts against sample claims and adjust element positions. Previews use the publishing renderer.
      </p>

      <div className="card">
        <div className="row">
          <label className="field">Brand<select value={brand} onChange={(e)=>{location.href=`/lab?brand=${e.target.value}`;}}>{catalog.brands.map(b=><option key={b.key} value={b.key}>{b.name}</option>)}</select></label>
          <label className="field">Fixture
            <select value={fixture} onChange={(e) => setFixture(e.target.value)}>
              {catalog.fixtures.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="field">Archetype
            <select value={archetype} onChange={(e) => setArchetype(e.target.value)}>
              {catalog.archetypes.map((a) => <option key={a.key}>{a.key}</option>)}
            </select>
          </label>
          <label className="field">Layout
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>
              {layouts.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="field">Skin
            <select value={skin} onChange={(e) => setSkin(e.target.value)}>
              {catalog.skins.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">Preview
            <select value={size} onChange={(e) => setSize(e.target.value as 'true' | 'feed')}>
              <option value="feed">feed size (360px)</option>
              <option value="true">true size (1080px)</option>
            </select>
          </label>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <span className="tag">accents</span>
          {ACCENTS.map((a) => {
            const on = accents.includes(a);
            const disabled = !on && accents.length >= 2;
            return (
              <button type="button" key={a} aria-pressed={on} disabled={disabled} className={`toggle ${on ? 'on' : ''}`}
                onClick={() => { if (disabled) return; setAccents(on ? accents.filter((x) => x !== a) : [...accents, a]); }}>
                {a}
              </button>
            );
          })}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="primary" onClick={render} disabled={busy}>{busy ? 'Rendering…' : 'Render'}</button>
          <button onClick={renderAll} disabled={busy}>Render all variants {progress}</button>
        </div>
      </div>

      {res?.error && <div className="empty" style={{ marginTop: 16, color: 'var(--bad)' }}>{res.error}</div>}

      {res?.url && (
        <div style={{ marginTop: 16 }}>
          <LayoutEditorPanel
            brand={brand} archetype={archetype} layout={layout}
            elements={res.elements ?? []} imageUrl={img(res.url)} displayWidth={displayWidth}
            onSaved={render}
          />
          <div className="card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Render checks</h2>
            <dl className="kv">
              <dt>fitText</dt>
              <dd>{res.guards?.fittedPx ?? '–'}{res.guards?.headlineOverflowed && <span className="tag drop"> Text overflow; truncated at minimum size</span>}</dd>
              <dt>logo corner</dt><dd>{res.guards?.logo ?? '–'}</dd>
              <dt>text treatment</dt>
              <dd>{res.guards?.treatment
                ? `scrim ${res.guards.treatment.scrim.toFixed(2)}, ${res.guards.treatment.colour}${res.guards.treatment.overImage ? '' : ', moved off image'}`
                : 'no image'}</dd>
              <dt>fonts</dt>
              <dd>{res.guards?.fontsPinned ? 'pinned in the renderer' : <span style={{ color: 'var(--warn)' }}>NOT pinned; run pnpm fonts</span>}</dd>
              <dt>render</dt><dd>{res.ms} ms</dd>
              <dt>resolved</dt>
              <dd className="metadata mono"><span>{res.spec?.archetype}</span><span>{res.spec?.layout}</span><span>{res.spec?.skin}</span><span>{res.spec?.accents.join(', ') || 'No accents'}</span></dd>
            </dl>
          </div>
        </div>
      )}

      {variants && (
        <>
          <h2>All variants</h2><p className="metadata"><span>{archetype}</span><span>{fixture}</span></p>
          <div className="sheet">
            {variants.map((v, i) => (
              <div key={i}>
                {v.url
                  ? <div className="art-frame"><img src={img(v.url)} alt="" loading="lazy" /></div>
                  : <div className="empty" style={{ fontSize: 11, padding: 12 }}>{v.error}</div>}
                <div className="metadata mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                  <span>{v.layout}</span><span>{v.skin}</span><span>{v.accents.join(', ') || 'No accents'}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
