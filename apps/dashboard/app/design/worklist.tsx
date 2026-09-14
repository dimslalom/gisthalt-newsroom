'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CertifyButton } from './certify-button.tsx';
import { DerivePanel } from './derive-panel.tsx';

interface Catalog {
  brands: { key: string; name: string }[];
  fixtures: string[];
  skins: string[];
  archetypes: { key: string; layouts: string[]; claimTypes: string[] }[];
}
interface WorklistRow {
  archetype: string; layout: string; label: string; custom: boolean; hasDocument: boolean;
  status: 'no-document' | 'uncertified' | 'certified' | 'failing';
}

const STATUS_LABEL: Record<WorklistRow['status'], string> = {
  'no-document': 'No document', uncertified: 'Uncertified', certified: 'Certified', failing: 'Failing',
};
const STATUS_COLOR: Record<WorklistRow['status'], string> = {
  'no-document': 'var(--muted)', uncertified: 'var(--warn)', certified: 'var(--good)', failing: 'var(--bad)',
};

/**
 * The coverage table: every layout slot this brand's archetypes offer, and
 * whether it's been hand-designed and certified yet. The entry point for the
 * "design one master per archetype, derive the siblings" workflow; a slot
 * with no document still composes fine (the built-in CSS template), so this
 * is a worklist of what's worth a human's attention, not a list of errors.
 */
export function Worklist({ initialCatalog, initialBrand }: { initialCatalog: Catalog; initialBrand: string }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [brand, setBrand] = useState(initialBrand);
  const [rows, setRows] = useState<WorklistRow[] | null>(null);
  const [deriveFor, setDeriveFor] = useState<string | null>(null); // "archetype/layout"
  const [addSlotFor, setAddSlotFor] = useState<string | null>(null); // archetype key
  const [slotDraft, setSlotDraft] = useState({ key: '', label: '', worksWithoutImage: false, handlesLongHeadline: false });
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const loadRows = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/worklist?brand=${brand}`, { cache: 'no-store' });
      const json = await res.json() as { rows?: WorklistRow[]; error?: string };
      if (!res.ok || !Array.isArray(json.rows)) throw new Error(json.error ?? 'Unable to load worklist');
      if (id === requestId.current) setRows(json.rows);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load worklist');
    } finally { if (id === requestId.current) setLoading(false); }
  }, [brand]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  useEffect(() => {
    if (brand === initialBrand) { setCatalog(initialCatalog); return; }
    fetch(`/api/catalog?brand=${brand}`, { cache: 'no-store' })
      .then((r) => r.json()).then((json: Catalog & { error?: string }) => { if (!json.error) setCatalog(json); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  async function addSlot(archetype: string) {
    if (!slotDraft.key.trim()) return;
    setError(null);
    const res = await fetch('/api/layout-slots/add', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, archetype, slot: slotDraft }),
    });
    const json = await res.json() as { error?: string };
    if (json.error) { setError(json.error); return; }
    setAddSlotFor(null);
    setSlotDraft({ key: '', label: '', worksWithoutImage: false, handlesLongHeadline: false });
    await loadRows();
  }

  async function removeSlot(archetype: string, key: string) {
    if (!confirm(`Remove the "${key}" layout slot from ${archetype}? Any saved document for it stays on disk but the composer will never pick it.`)) return;
    setRowBusy(`${archetype}/${key}`); setError(null);
    try {
      const res = await fetch('/api/layout-slots/remove', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, key }),
      });
      const json = await res.json() as { error?: string };
      if (json.error) { setError(json.error); return; }
      await loadRows();
    } finally { setRowBusy(null); }
  }



  const byArchetype = new Map<string, WorklistRow[]>();
  for (const r of rows ?? []) byArchetype.set(r.archetype, [...(byArchetype.get(r.archetype) ?? []), r]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 6 }}>
          {catalog.brands.map((b) => (
            <button key={b.key} type="button" aria-pressed={brand === b.key}
              className={`toggle ${brand === b.key ? 'on' : ''}`}
              onClick={() => { setBrand(b.key); setRows(null); setDeriveFor(null); }}
              style={{ fontSize: 12, padding: '5px 10px' }}
            >{b.name}</button>
          ))}
        </div>
        <CertifyButton />
      </div>

      {loading && <p role="status">Loading worklist…</p>}
      {error && <div className="row" role="alert"><span style={{ color: 'var(--bad)' }}>{error}</span><button disabled={loading} onClick={() => void loadRows()}>Retry</button></div>}
      {!loading && !error && rows?.length === 0 && <p className="empty">No layout slots for this brand.</p>}

      {rows && catalog.archetypes.map((a) => {
        const archRows = byArchetype.get(a.key) ?? [];
        return (
          <div key={a.key} className="card" style={{ display: 'grid', gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong className="panel-title">{a.key}</strong>
              <button type="button" onClick={() => setAddSlotFor(addSlotFor === a.key ? null : a.key)} style={{ fontSize: 11, padding: '3px 8px' }}>
                {addSlotFor === a.key ? 'Cancel' : '+ Add slot'}
              </button>
            </div>

            {addSlotFor === a.key && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <label className="field">Key
                  <input value={slotDraft.key} placeholder="e.g. tall-crop" onChange={(e) => setSlotDraft((d) => ({ ...d, key: e.target.value }))} style={{ width: 140 }} />
                </label>
                <label className="field">Label
                  <input value={slotDraft.label} placeholder={slotDraft.key || 'label'} onChange={(e) => setSlotDraft((d) => ({ ...d, label: e.target.value }))} style={{ width: 140 }} />
                </label>
                <label className="row" style={{ gap: 4, alignSelf: 'end', fontSize: 12 }}>
                  <input type="checkbox" checked={slotDraft.worksWithoutImage} onChange={(e) => setSlotDraft((d) => ({ ...d, worksWithoutImage: e.target.checked }))} />
                  Works without an image
                </label>
                <label className="row" style={{ gap: 4, alignSelf: 'end', fontSize: 12 }}>
                  <input type="checkbox" checked={slotDraft.handlesLongHeadline} onChange={(e) => setSlotDraft((d) => ({ ...d, handlesLongHeadline: e.target.checked }))} />
                  Handles a long headline
                </label>
                <button type="button" className="primary" disabled={!slotDraft.key.trim()} onClick={() => void addSlot(a.key)} style={{ alignSelf: 'end', fontSize: 12 }}>Add</button>
              </div>
            )}

            <div style={{ display: 'grid', gap: 4 }}>
              {archRows.map((r) => {
                const rowKey = `${r.archetype}/${r.layout}`;
                return (
                  <div key={rowKey}>
                    <div className="worklist-row">
                      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLOR[r.status], display: 'inline-block' }} />
                        <span style={{ fontSize: 13 }}>{r.label}</span>
                        {r.custom && <span style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '.05em', textTransform: 'uppercase' }}>custom</span>}
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{STATUS_LABEL[r.status]}</span>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <Link href={`/design/${brand}/${a.key}/${r.layout}`} style={{
                          fontSize: 11, padding: '3px 8px', background: 'var(--panel-2)', color: 'var(--fg)',
                          border: '1px solid #484848', borderRadius: 'var(--radius-control)',
                        }}>Design</Link>
                        <button type="button" onClick={() => setDeriveFor(deriveFor === rowKey ? null : rowKey)} style={{ fontSize: 11, padding: '3px 8px' }}>
                          {deriveFor === rowKey ? 'Cancel' : 'Derive…'}
                        </button>
                        <button type="button" className="quiet-action" disabled={rowBusy === rowKey} onClick={() => void removeSlot(a.key, r.layout)} style={{ fontSize: 11, padding: '3px 8px' }}>
                          Remove slot
                        </button>
                      </div>
                    </div>
                    {deriveFor === rowKey && (
                      <DerivePanel
                        brand={brand} archetype={a.key} targetLayout={r.layout}
                        fixture={catalog.fixtures.find((f) => f.includes('basic')) ?? catalog.fixtures[0] ?? 'classification-basic'}
                        sourceOptions={archRows.filter((s) => s.layout !== r.layout).map((s) => ({ key: s.layout, label: s.label, hasDocument: s.hasDocument }))}
                        onClose={() => setDeriveFor(null)}
                        onAccepted={() => { setDeriveFor(null); void loadRows(); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
