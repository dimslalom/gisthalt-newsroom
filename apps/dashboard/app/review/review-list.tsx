'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DEFAULT_FILTERS, filterReviews, type ReviewFilters } from './filters.ts';

const LIMITS: Record<string, number> = { x: 280, instagram: 2200, threads: 500, tiktok: 2200 };

export interface ReviewItem {
  id: string; rule: string; reason: string; state: string; expiresInMinutes: number;
  headline: string; vertical: string | null; claimType: string; tier: string; domain: string; sourceUrl: string | null;
  quote: string | null; quoteNote: string | null;
  observedAt: string | null; note: string | null;
  entities: Record<string, string>; values: Record<string, unknown>;
  captions: Record<string, string> | null; compositionId: string | null; imageUrl: string | null; images: string[];
}

export function ReviewList({ items, initialVertical, initialStatus }: { items: ReviewItem[]; initialVertical?: string; initialStatus?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReviewFilters>({ ...DEFAULT_FILTERS,
    vertical: ['f1', 'vct', 'film'].includes(initialVertical ?? '') ? initialVertical! : 'all',
    status: ['active', 'pending', 'held', 'expired', 'approved', 'rejected', 'all'].includes(initialStatus ?? '') ? initialStatus! : 'active' });
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterReviews(items, filters), [items, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 24, (currentPage + 1) * 24);
  const options = (key: 'claimType' | 'tier' | 'domain') => [...new Set(items.filter((it) => filters.vertical === 'all' || it.vertical === filters.vertical).map((it) => it[key]))].sort();
  const change = (key: keyof ReviewFilters, value: string) => { setFilters((f) => ({ ...f, [key]: value })); setPage(0); };

  async function regenerate() {
    setBusy('regenerate'); setMessage('Preparing recent F1 reviews…');
    try {
      const res = await fetch('/api/review/regenerate', { method: 'POST' });
      const data = await res.json() as { regenerated?: number; errors?: unknown[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Regeneration failed');
      setFilters({ ...DEFAULT_FILTERS, vertical: 'f1' }); setPage(0);
      setMessage(data.regenerated ? `${data.regenerated} recent F1 reviews regenerated.${data.errors?.length ? ` ${data.errors.length} previews could not render.` : ''} Nothing was published.` : 'No additional eligible F1 reviews from the last 24 hours. Check active or expired F1 reviews.');
      router.refresh();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(null); }
  }

  async function act(action: string, body: Record<string, unknown>) {
    setBusy(`${action}:${body.reviewId ?? body.compositionId}`);
    try {
      const res = await fetch('/api/review', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) alert((await res.json()).error);
      router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <>
      <h1>Review queue <span className="metadata"><span>{filtered.length} matching</span><span>{items.filter((it) => ['pending', 'held'].includes(it.state)).length} incoming</span></span></h1>
      <p className="lede">Every card shows the rule that fired, the tier and domain, the extracted
        claim and its supporting quote, and the expiry countdown.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field">Brand<select value={filters.vertical} onChange={(e) => { setFilters({ ...DEFAULT_FILTERS, vertical: e.target.value, status: filters.status }); setPage(0); }}>
            <option value="all">All brands</option><option value="f1">F1</option><option value="vct">Valorant</option><option value="film">Film / TV</option>
          </select></label>
          <label className="field">Status<select value={filters.status} onChange={(e) => change('status', e.target.value)}>
            <option value="active">Incoming (pending + held)</option><option value="pending">Pending</option><option value="held">Held</option><option value="expired">Expired</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option>
          </select></label>
          <label className="field">Content type<select value={filters.type} onChange={(e) => change('type', e.target.value)}><option value="all">All types</option>{options('claimType').map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="field">Tier<select value={filters.tier} onChange={(e) => change('tier', e.target.value)}><option value="all">All tiers</option>{options('tier').map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="field">Source<select value={filters.domain} onChange={(e) => change('domain', e.target.value)}><option value="all">All sources</option>{options('domain').map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="field">Search<input type="search" value={filters.search} placeholder="Headline, source or topic" onChange={(e) => change('search', e.target.value)} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={() => { setFilters({ ...DEFAULT_FILTERS }); setPage(0); }}>Clear filters</button>
          <button disabled={busy !== null} onClick={regenerate}>{busy === 'regenerate' ? 'Regenerating…' : 'Regenerate recent F1 reviews'}</button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Last 24 hours; expired items only. Source dates and publication safeguards stay intact.</span>
        </div>
        {message && <p role="status" style={{ marginBottom: 0 }}>{message}</p>}
      </div>

      {filtered.length === 0 && <div className="empty">No reviews match these filters. Try another brand or choose Expired; incoming reviews expire after 90 minutes.</div>}

      <div className="grid">
        {visible.map((it) => (
          <div className="card" key={it.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <span className="tag review">{it.rule}</span>
                <span className="tag">tier {it.tier}</span>
                <span className="tag">{it.claimType}</span>
                <span className="tag">{it.vertical}</span>
                {!['pending', 'held'].includes(it.state) && <span className="tag">{it.state}</span>}
                {it.state === 'held' && <span className="tag">held for a second source</span>}
              </div>
              <span className="tag" style={{ color: (['rejected', 'failed'].includes(it.state) || (['pending', 'held'].includes(it.state) && it.expiresInMinutes < 15)) ? 'var(--bad)' : 'var(--muted)' }}>
                {['pending', 'held'].includes(it.state) ? `expires in ${it.expiresInMinutes}m` : it.state}
              </span>
            </div>

            <div className={it.images.length ? "review-summary has-media" : "review-summary"}>
            {it.images.length > 0 && <div className="review-media">{it.images.map((src,i)=><img key={src} src={src} alt={`${it.headline}; slide ${i+1}`} style={{width:216,height:270,objectFit:"contain",flexShrink:0}} />)}</div>}
            <div><h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{it.headline}</h3>
            {it.observedAt && <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--muted)' }}>Source date: {new Date(it.observedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} (Brisbane)</p>}
            {it.note?.startsWith('Regenerated') && <p style={{ fontSize: 12, color: 'var(--warn)' }}>Regenerated for manual review. Check the source date before posting.</p>}
            <div className="metadata">
              <span>{it.domain}</span>{it.sourceUrl && <a href={it.sourceUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Source</a>}<span>{it.reason}</span>
            </div>

            <div className="review-details">
              <div>
                <div className="tag">supporting quote</div>
                <div style={{ marginTop: 6, fontSize: 13, color: it.quote ? undefined : 'var(--warn)' }}>
                  {it.quote ? `“${it.quote}”` : it.quoteNote}
                </div>
              </div>
              <div>
                <div className="tag">extracted claim</div>
                <pre className="mono" style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify({ entities: it.entities, values: it.values }, null, 1).slice(0, 600)}
                </pre>
              </div>
            </div>

            </div></div>
            {it.captions && (
              <div className="caption-grid">
                {Object.entries(it.captions).map(([platform, caption]) => (
                  <label className="field" key={platform}>
                    <span className="metadata"><span>{platform}</span><span>{caption.length}/{LIMITS[platform] ?? 2200}</span></span>
                    <textarea defaultValue={caption} rows={4}
                      readOnly={!['pending', 'held'].includes(it.state)}
                      onBlur={(e) => { if (['pending', 'held'].includes(it.state)) void act('caption', { compositionId: it.compositionId, platform, caption: e.target.value }); }} />
                    <button type="button" style={{ justifySelf: 'start', fontSize: 11, padding: '3px 8px' }}
                      onClick={(e) => {
                        // The textarea's live value, so an edit not yet blurred is still what gets copied.
                        const text = e.currentTarget.parentElement?.querySelector('textarea')?.value ?? caption;
                        void navigator.clipboard.writeText(text);
                      }}>Copy {platform} caption</button>
                  </label>
                ))}
              </div>
            )}

            {it.compositionId && (
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <a className="button-link" href={`/design/post/${it.compositionId}`}>Edit design</a>
                <a className="button-link" href={`/api/post-export?compositionId=${it.compositionId}&format=feed`} download>Download 4:5 (X, IG, Threads)</a>
                <a className="button-link" href={`/api/post-export?compositionId=${it.compositionId}&format=vertical`} download>Download 9:16 (TikTok)</a>
              </div>
            )}

            {['pending', 'held'].includes(it.state) && <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" disabled={busy !== null} onClick={() => act('approve', { reviewId: it.id })}>Publish</button>
              {it.vertical === 'f1' && <button disabled={busy !== null || it.claimType === 'demo'} onClick={() => act('launch_f1', { reviewId: it.id })}>Launch X + Instagram + TikTok</button>}
              <button disabled={busy !== null} onClick={() => act('reshuffle', { reviewId: it.id })}>Reshuffle design</button>
              <button disabled={busy !== null} onClick={() => act('hold', { reviewId: it.id })}>Hold for second source</button>
              <button className="danger" disabled={busy !== null} onClick={() => act('reject', { reviewId: it.id })}>Reject</button>
            </div>}
          </div>
        ))}
      </div>
      {pageCount > 1 && <div className="row" style={{ marginTop: 16 }}><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    </>
  );
}
