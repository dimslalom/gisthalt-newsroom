'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const LIMITS: Record<string, number> = { x: 280, instagram: 2200, threads: 500, tiktok: 2200 };

export interface ReviewItem {
  id: string; rule: string; reason: string; state: string; expiresInMinutes: number;
  headline: string; claimType: string; tier: string; domain: string; sourceUrl: string | null;
  quote: string | null; quoteNote: string | null;
  entities: Record<string, string>; values: Record<string, unknown>;
  captions: Record<string, string> | null; compositionId: string | null; imageUrl: string | null; images: string[];
}

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

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

  if (items.length === 0) {
    return (
      <>
        <h1>Review queue</h1>
        <div className="empty">Nothing pending. Items expire after 90 minutes and auto-reject —
          a stale queue looks busy without being busy.</div>
      </>
    );
  }

  return (
    <>
      <h1>Review queue <span className="tag">{items.length} pending</span></h1>
      <p className="lede">Every card shows the rule that fired, the tier and domain, the extracted
        claim and its supporting quote, and the expiry countdown.</p>

      <div className="grid">
        {items.map((it) => (
          <div className="card" key={it.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <span className="tag review">{it.rule}</span>
                <span className="tag">tier {it.tier}</span>
                <span className="tag">{it.claimType}</span>
                {it.state === 'held' && <span className="tag">held for a second source</span>}
              </div>
              <span className="tag" style={{ color: it.expiresInMinutes < 15 ? 'var(--bad)' : 'var(--muted)' }}>
                expires in {it.expiresInMinutes}m
              </span>
            </div>

            {it.images.length > 0 && <div style={{display:"flex",gap:8,overflowX:"auto"}}>{it.images.map((src,i)=><img key={src} src={src} alt={`${it.headline} — slide ${i+1}`} style={{width:216,height:270,objectFit:"contain",marginTop:12}} />)}</div>}
            <h3 style={{ margin: '10px 0 4px', fontSize: 18 }}>{it.headline}</h3>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {it.domain}{it.sourceUrl && <> · <a href={it.sourceUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>source</a></>} · {it.reason}
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
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

            {it.captions && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}>
                {Object.entries(it.captions).map(([platform, caption]) => (
                  <label className="field" key={platform}>
                    {platform} · {caption.length}/{LIMITS[platform] ?? 2200}
                    <textarea defaultValue={caption} rows={4}
                      onBlur={(e) => act('caption', { compositionId: it.compositionId, platform, caption: e.target.value })} />
                  </label>
                ))}
              </div>
            )}

            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" disabled={busy !== null} onClick={() => act('approve', { reviewId: it.id })}>Publish</button>
              <button disabled={busy !== null} onClick={() => act('reshuffle', { reviewId: it.id })}>Reshuffle design</button>
              <button disabled={busy !== null} onClick={() => act('hold', { reviewId: it.id })}>Hold for second source</button>
              <button className="danger" disabled={busy !== null} onClick={() => act('reject', { reviewId: it.id })}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
