'use client';
import { useMemo, useState } from 'react';

interface Tile { id: string; url: string; layout: string; skin: string; accents: string[]; archetype: string }

export function Sheet({ tiles }: { tiles: Tile[] }) {
  const [seeding, setSeeding] = useState(false);
  const img = (u: string) => `/api/render/image?path=${encodeURIComponent(u)}`;

  /** The specific failure this catches: adjacent tiles that look alike. */
  const clumps = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i < tiles.length; i++) {
      const a = tiles[i - 1]!, b = tiles[i]!;
      if (a.layout === b.layout && a.skin === b.skin) out.push(i);
    }
    return out;
  }, [tiles]);

  async function seed() {
    setSeeding(true);
    await fetch('/api/pipeline', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ render: true }) });
    setSeeding(false);
    location.reload();
  }

  if (tiles.length === 0) {
    return (
      <>
        <h1>Contact sheet</h1>
        <div className="empty">
          Nothing rendered yet. <button onClick={seed} disabled={seeding} style={{ marginLeft: 8 }}>
            {seeding ? 'Running the pipeline…' : 'Run one pipeline tick'}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Contact sheet <span className="tag">{tiles.length} posts</span></h1>
      <p className="lede">
        Compare recent posts and check for repeated layouts.
        {clumps.length > 0
          ? <strong style={{ color: 'var(--warn)' }}> {clumps.length} adjacent pairs share a layout and skin.</strong>
          : <span style={{ color: 'var(--good)' }}> No two adjacent tiles share a layout and skin.</span>}
      </p>

      <h2>Instagram profile preview</h2><p className="lede">The last nine posts in profile order.</p>
      <div className="profile-grid">
        {tiles.slice(0, 9).map((t) => <img key={t.id} src={img(t.url)} alt="" />)}
      </div>

      <h2>All renders</h2>
      <div className="sheet">
        {tiles.map((t, i) => (
          <div key={t.id}>
            <div className="art-frame" style={clumps.includes(i) ? { outline: '2px solid var(--warn)' } : undefined}>
              <img src={img(t.url)} alt="" loading="lazy" />
            </div>
            <div className="metadata mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              <span>{t.archetype}</span><span>{t.layout}</span><span>{t.skin}</span>
            </div>
            <a className="button-link" href={`/design/post/${t.id}`} style={{ marginTop: 6 }}>Edit design &amp; export</a>
          </div>
        ))}
      </div>
    </>
  );
}
