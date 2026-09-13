import { SourceControl, RetractControl } from './source-controls.tsx';
import { Reconciliation } from './reconciliation.tsx';
import { Controls } from './controls.tsx';
import { store } from '../../lib/store.ts';
import { getCatalog } from '../../lib/renderer.ts';
import { assessReadiness } from '@newsroom/pipeline';

export const dynamic = 'force-dynamic';

const ago = (d: Date | null | undefined) => {
  if (!d) return '–';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

export default async function Ops() {
  const s = await store();
  const now = new Date();
  const catalog = await getCatalog();
  const readiness = assessReadiness(s, { rendererUp: Boolean(catalog), dryRun: process.env.PUBLISH_DRY_RUN !== 'false' });
  const published = s.posts.filter((p) => p.status === 'published');
  const latencies = published.map((p) => p.latencyMs ?? 0).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;

  return (
    <>
      <h1>Ops</h1>
      <p className="lede">
        Monitor source polling, publishing sessions, and queue activity.
      </p>

      <div className="metrics">
        {[
          ['Items', s.items.length],
          ['Claims', s.claims.length],
          ['Queue depth', s.posts.filter((p) => p.status === 'ready').length],
          ['Pending review', s.pendingReviews(now).length],
          ['Sent / simulated today', s.accounts.reduce((a, acc) => a + s.postsPublishedToday(acc.id, now), 0)],
          ['Publish p50', `${p50} ms`],
          ['Renderer', catalog ? 'up' : 'DOWN'],
        ].map(([k, v]) => (
          <div className="metric" key={String(k)}>
            <div className="tag">{k}</div>
            <div className="metric-value" style={{ color: v === 'DOWN' ? 'var(--bad)' : undefined }}>{v as any}</div>
          </div>
        ))}
      </div>

      <section className="card" aria-label="Launch readiness">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Launch readiness</h2>
          <span className={`tag ${readiness.level === 'pass' ? 'auto' : readiness.level === 'fail' ? 'drop' : 'review'}`}>{readiness.level === 'pass' ? 'Ready' : readiness.level === 'fail' ? 'Blocked' : 'Needs attention'}</span>
        </div>
        <p className="metadata">{readiness.mode === 'dry-run' ? 'Simulation safety check' : 'Live publishing preflight'}</p>
        <ul className="readiness-list">
          {readiness.checks.map((check) => <li key={check.key}><span className={`tag ${check.level === 'pass' ? 'auto' : check.level === 'fail' ? 'drop' : 'review'}`}>{check.level}</span><span>{check.message}</span></li>)}
        </ul>
      </section>

      <Controls killed={s.setting('killSwitch', false)} />
      <dl className="kv">
        <dt>Mode</dt><dd>{process.env.PUBLISH_DRY_RUN !== 'false' ? 'Dry run (posts are simulated)' : 'Live native agent'}</dd>
        <dt>Worker heartbeat</dt><dd>{ago(s.setting('workerHeartbeat', null))}</dd>
        <dt>Agent heartbeat</dt><dd>{ago(s.setting('agentHeartbeat', null))}</dd>
      </dl>
      <h2>Source health</h2>
      <div className="card scroll">
        <table className="data">
          <thead><tr><th>Source</th><th>Tier</th><th>Cadence</th><th>Last success</th><th>Items</th><th>Last error</th><th>Control</th></tr></thead>
          <tbody>
            {s.sources.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No source has been polled yet. Run <code>pnpm pipeline poll</code>.</td></tr>}
            {s.sources.map((src) => (
              <tr key={src.id}>
                <td className="mono">{src.key}</td>
                <td><span className="tag">{src.tier}</span></td>
                <td>{src.cadenceSeconds}s</td>
                <td style={{ color: src.lastSuccessAt ? undefined : 'var(--warn)' }}>{ago(src.lastSuccessAt)}</td>
                <td>{src.itemsSeen}</td>
                <td style={{ color: 'var(--bad)', maxWidth: 380 }}>{src.lastError ?? ''}</td><td><SourceControl sourceKey={src.key} active={src.active}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: '24px 0 10px' }}>Accounts and warm-up</h2>
        <a href="/accounts" style={{ fontSize: 12, textDecoration: 'underline' }}>Edit handles, warm-up and caps →</a>
      </div>
      <div className="card scroll">
        <table className="data">
          <thead><tr><th>Account</th><th>Platform</th><th>Warm-up</th><th>Today</th><th>Cap</th><th>Session</th><th>Active</th></tr></thead>
          <tbody>
            {s.accounts.map((a) => {
              const today = s.postsPublishedToday(a.id, now);
              const session = s.sessions.find((x) => x.accountId === a.id);
              return (
                <tr key={a.id}>
                  <td className="mono">{a.handle}</td>
                  <td>{a.platform}</td>
                  <td>stage {a.warmupStage}</td>
                  <td style={{ color: today >= a.dailyCap ? 'var(--warn)' : undefined }}>{today}</td>
                  <td>{a.dailyCap}</td>
                  <td>{session ? (session.healthy ? <span className="tag auto">healthy</span> : <span className="metadata"><span className="tag drop">Offline</span><span>{ago(session.lastCheckAt)}</span></span>) : <span className="tag">unchecked</span>}</td>
                  <td>{a.active ? 'yes' : 'no'}</td>
                </tr>
              );
            })}
            {s.accounts.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>No accounts. Run <code>pnpm seed</code>.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Publish log</h2>
      <div className="card scroll">
        <table className="data">
          <thead><tr><th>Status</th><th>Platform</th><th>Post ID</th><th>Scheduled</th><th>Published</th><th>Latency</th><th>Detail</th><th>Action</th></tr></thead>
          <tbody>
            {s.posts.slice(-25).reverse().map((p) => (
              <tr key={p.id}>
                <td><span className={`tag ${p.status === 'published' ? 'auto' : p.status === 'failed' ? 'drop' : 'review'}`}>{p.status}</span></td>
                <td>{p.platform}</td>
                <td className="mono" style={{ fontSize: 11 }}>{p.platformPostId ?? '–'}</td>
                <td>{p.scheduledFor ? new Date(p.scheduledFor).toLocaleTimeString() : '–'}</td>
                <td>{p.publishedAt ? new Date(p.publishedAt).toLocaleTimeString() : '–'}</td>
                <td>{p.latencyMs ? `${p.latencyMs} ms` : '–'}</td>
                <td style={{ color: 'var(--muted)', maxWidth: 320 }}>{p.error ?? p.archivePath ?? ''}</td><td>{['ready','held','published','publishing','uncertain'].includes(p.status) && <RetractControl postId={p.id} live={['published','publishing','uncertain'].includes(p.status)}/>}</td>
              </tr>
            ))}
            {s.posts.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>Nothing queued yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Reconciliation posts={s.posts.filter(p=>['failed','publishing','uncertain','retraction_requested'].includes(p.status)).map(p=>({id:p.id,status:p.status,platform:p.platform}))} />
      <h2>Pipeline log</h2>
      <div className="card scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
        <table className="data">
          <tbody>
            {s.recentEvents(60).map((e) => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleTimeString()}</td>
                <td><span className="tag">{e.stage}</span></td>
                <td style={{ color: e.level === 'error' ? 'var(--bad)' : e.level === 'warn' ? 'var(--warn)' : undefined }}>{e.msg}</td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{e.dedupeHash?.slice(0, 10) ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
