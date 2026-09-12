'use client';
import { useEffect, useState } from 'react';
import type { Catalog } from '../../lib/renderer.ts';

const ACCENTS = ['diagonal', 'halftone', 'grain', 'ticker', 'watermark', 'cropmarks'];

interface RenderResponse {
  url?: string; ms?: number; error?: string;
  guards?: { logo: string; headlineOverflowed: boolean; fittedPx: string | null; fontsPinned: boolean;
             treatment: { scrim: number; colour: string; overImage: boolean } | null };
  spec?: { archetype: string; layout: string; skin: string; accents: string[] };
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

  return (
    <>
      <h1>Template lab</h1>
      <p className="lede">
        Every layout must be provable against every fixture before it ships. These previews are
        rendered by the container renderer, so what you see is what the publisher uploads.
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
              <span key={a} className={`toggle ${on ? 'on' : ''}`} style={disabled ? { opacity: .4 } : undefined}
                onClick={() => { if (disabled) return; setAccents(on ? accents.filter((x) => x !== a) : [...accents, a]); }}>
                {a}
              </span>
            );
          })}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="primary" onClick={render} disabled={busy}>{busy ? 'Rendering…' : 'Render'}</button>
          <button onClick={renderAll} disabled={busy}>Render all variants {progress}</button>
        </div>
      </div>

      {res?.error && <div className="empty" style={{ marginTop: 16, color: 'var(--bad)' }}>{res.error}</div>}

      {res?.url && (
        <div className="grid" style={{ gridTemplateColumns: size === 'true' ? '1080px 320px' : '360px 1fr', marginTop: 16, alignItems: 'start' }}>
          <div className="art-frame" style={{ width: size === 'true' ? 1080 : 360 }}>
            <img src={img(res.url)} alt="" width={1080} height={1350} />
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>What the guards decided</h2>
            <dl className="kv">
              <dt>fitText</dt>
              <dd>{res.guards?.fittedPx ?? '–'}{res.guards?.headlineOverflowed ? ' · OVERFLOW, ellipsised at the floor' : ''}</dd>
              <dt>logo corner</dt><dd>{res.guards?.logo ?? '–'}</dd>
              <dt>text treatment</dt>
              <dd>{res.guards?.treatment
                ? `scrim ${res.guards.treatment.scrim.toFixed(2)}, ${res.guards.treatment.colour}${res.guards.treatment.overImage ? '' : ', moved off image'}`
                : 'no image'}</dd>
              <dt>fonts</dt>
              <dd>{res.guards?.fontsPinned ? 'pinned in the renderer' : <span style={{ color: 'var(--warn)' }}>NOT pinned — run pnpm fonts</span>}</dd>
              <dt>render</dt><dd>{res.ms} ms</dd>
              <dt>resolved</dt>
              <dd className="mono">{res.spec?.archetype} / {res.spec?.layout} / {res.spec?.skin} / [{res.spec?.accents.join(', ') || 'none'}]</dd>
            </dl>
          </div>
        </div>
      )}

      {variants && (
        <>
          <h2>All variants · {archetype} · {fixture}</h2>
          <div className="sheet">
            {variants.map((v, i) => (
              <div key={i}>
                {v.url
                  ? <div className="art-frame"><img src={img(v.url)} alt="" loading="lazy" /></div>
                  : <div className="empty" style={{ fontSize: 11, padding: 12 }}>{v.error}</div>}
                <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                  {v.layout} · {v.skin} · {v.accents.join('+') || 'none'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
