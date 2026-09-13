'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './accounts.module.css';

interface AccountRow {
  id: string; platform: string; handle: string; warmupStage: number; dailyCap: number;
  active: boolean; needsSetup: boolean; postsToday: number;
  session: { healthy: boolean; lastCheckAt: Date | string | null } | null;
}
interface BrandGroup { key: string; name: string; vertical: string; accounts: AccountRow[]; configuredCount: number }

const PLATFORM_LABEL: Record<string, string> = { x: 'X', instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok' };

/** Index matches the warmupStage integer the DB stores (0-4). Caps mirror the plan's ramp. */
const STAGES = [
  { label: 'Manual only', hint: 'No automated posts. Post by hand, follow people, comment; build a usage history.', suggestedCap: 0 },
  { label: 'Week 3: ramping', hint: 'First automated posts, only during plausible waking hours.', suggestedCap: 3 },
  { label: 'Week 4: ramping', hint: 'Still mixing in manual posts so the pattern isn’t purely mechanical.', suggestedCap: 6 },
  { label: 'Weeks 5–6: live events on', hint: 'Live event coverage switched on; posts cluster around real timing.', suggestedCap: 9 },
  { label: 'Steady state', hint: 'The floor is 5–7/day; event days run 12–16. This is where it settles.', suggestedCap: 16 },
];

function AccountCard({ account, brandKey, onSaved, setLoading }: { account: AccountRow; brandKey: string; onSaved: () => void; setLoading: (message: string | null) => void }) {
  const [handle, setHandle] = useState(account.handle);
  const [stage, setStage] = useState(account.warmupStage);
  const [cap, setCap] = useState(account.dailyCap);
  const [active, setActive] = useState(account.active);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  const dirty = handle !== account.handle || stage !== account.warmupStage || cap !== account.dailyCap || active !== account.active;
  const looksLikeHandle = handle.trim() === '' || handle.trim().startsWith('@');

  async function save() {
    setBusy(true); setLoading(`Saving ${PLATFORM_LABEL[account.platform] ?? account.platform} settings…`); setError(''); setJustSaved(false);
    try {
      const res = await fetch('/api/ops', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'account', id: account.id, handle: handle.trim(), warmupStage: stage, dailyCap: cap, active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'save failed');
      setJustSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setLoading(null);
    }
  }

  return (
    <div className={`card ${styles.platform}`}>
      <div className={`row ${styles.identity}`} style={{ justifyContent: 'space-between' }}>
        <span className="panel-title">{PLATFORM_LABEL[account.platform] ?? account.platform}</span>
        <div className="row" style={{ gap: 6 }}>
          {account.needsSetup && <span className="tag" style={{ color: 'var(--warn)' }}>needs setup</span>}
          {!account.needsSetup && !account.active && <span className="tag">Inactive</span>}
          {account.active && <span className="tag auto">active</span>}
        </div>
      </div>

      <label className="field">Handle
        <input
          value={handle} onChange={(e) => setHandle(e.target.value)}
          placeholder="@handle"
          style={!looksLikeHandle ? { borderColor: 'var(--warn)' } : undefined}
        />
      </label>
      {!looksLikeHandle && <p style={{ margin: 0, fontSize: 11, color: 'var(--warn)' }}>Handles usually start with @; double-check before saving.</p>}

      <label className="field">Warm-up stage
        <select value={stage} onChange={(e) => { const v = Number(e.target.value); setStage(v); setCap(STAGES[v]!.suggestedCap); }}>
          {STAGES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
        </select>
      </label>

      <div className="row">
        <label className="field" style={{ flex: 1 }}>Daily cap
          <input type="number" min={0} max={16} value={cap} onChange={(e) => setCap(Math.max(0, Math.min(16, Number(e.target.value) || 0)))} />
        </label>
        <label className="toggle" style={{ marginTop: 18 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ margin: 0 }} /> Active
        </label>
      </div>

      <div className={`row ${styles.status}`} style={{ fontSize: 11, color: 'var(--muted)' }}>
        <span>{account.postsToday} sent today</span>
        <span>{account.session ? (account.session.healthy ? <span style={{ color: 'var(--good)' }}>session healthy</span> : <span style={{ color: 'var(--bad)' }}>session needs login</span>) : 'no session check yet'}</span>
      </div>

      {error && <p className={styles.full} role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--bad)' }}>{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button disabled={busy} onClick={() => setRemoving(true)}>Remove platform</button>
        {justSaved && !dirty && <span className="tag" style={{ color: 'var(--good)' }}>saved</span>}
      </div>
      {removing && <div className={styles.full} role="group" aria-label="Confirm platform removal"><p>Remove this platform? Queued posts are cancelled; Chrome profile and history are kept.</p><button disabled={busy} onClick={async () => { setBusy(true); setLoading(`Removing ${PLATFORM_LABEL[account.platform] ?? account.platform}…`); setError(''); try { await update({action:'platform_remove',key:brandKey,platform:account.platform}); onSaved(); } catch(e) {setError((e as Error).message);} finally {setBusy(false);setLoading(null);} }}>Confirm removal</button> <button onClick={() => setRemoving(false)}>Keep platform</button></div>}
    </div>
  );
}

async function update(body: Record<string,unknown>) {
  const res = await fetch('/api/ops',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result = await res.json(); if (!res.ok) throw new Error(result.error ?? 'Unable to save');
}
function BrandSettings({group:g,onSaved,setLoading}:{group:BrandGroup;onSaved:()=>void;setLoading:(message:string|null)=>void}) {
  const [name,setName]=useState(g.name), [vertical,setVertical]=useState(g.vertical);
  const [platform,setPlatform]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const missing=Object.keys(PLATFORM_LABEL).filter(p=>!g.accounts.some(a=>a.platform===p));
  async function run(body:Record<string,unknown>, message:string) {setBusy(true);setLoading(message);setError('');try {await update(body);onSaved();} catch(e){setError((e as Error).message);} finally {setBusy(false);setLoading(null);}}
  return <div className="card" style={{marginTop:12}}>
    <div className="row" style={{alignItems:'end',flexWrap:'wrap'}}>
      <label className="field" style={{flex:1}}>Brand name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label className="field">Content type<select value={vertical} onChange={e=>setVertical(e.target.value)}><option value="f1">Formula 1</option><option value="film">Film & TV</option><option value="vct">VCT</option></select></label>
      <button className="primary" disabled={busy || (name===g.name && vertical===g.vertical)} onClick={()=>run({action:'brand',key:g.key,name,vertical}, 'Saving brand settings…')}>Save brand</button>
    </div>
    <p style={{color:'var(--muted)',fontSize:12}}>Content type determines news routing and the existing design preset. Renaming keeps account IDs and Chrome profiles unchanged. Custom artwork remains managed in the design tool.</p>
    {vertical!==g.vertical && <p>Changing type pauses platforms and cancels queued posts. Check settings before re-enabling publishing.</p>}
    {missing.length>0 && <div className="row"><select aria-label="Platform to add" value={missing.includes(platform)?platform:''} onChange={e=>setPlatform(e.target.value)}><option value="">Choose a platform</option>{missing.map(p=><option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select><button disabled={busy || !missing.includes(platform)} onClick={()=>run({action:'platform_add',key:g.key,platform}, `Adding ${PLATFORM_LABEL[platform]}…`)}>Add platform</button></div>}
    {error && <p role="alert" style={{color:'var(--bad)'}}>{error}</p>}
  </div>;
}

export function AccountsBoard({ groups }: { groups: BrandGroup[] }) {
  const router = useRouter();
  const [selected,setSelected]=useState(groups[0]?.key);
  const [loading, setLoading] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gap: 28 }} aria-busy={Boolean(loading)}>
      {loading && <div className={styles.loading} role="status" aria-live="polite"><span className={styles.spinner} aria-hidden="true" /><strong>{loading}</strong><small>Please keep this page open.</small></div>}
      <nav className="row" aria-label="Publishing brands" style={{flexWrap:'wrap'}}>{groups.map(g=><button key={g.key} aria-pressed={selected===g.key} onClick={()=>setSelected(g.key)} className={selected===g.key?'primary':undefined}>{g.name} · {g.accounts.length} platforms</button>)}</nav>
      {groups.filter(g=>g.key===selected).map((g) => (
        <section key={g.key}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="row"><h2 style={{ margin: 0 }}>{g.name}</h2><span className="tag">{g.vertical}</span></div>
            <span className="tag">{g.configuredCount}/{g.accounts.length} configured</span>
          </div>
          <BrandSettings key={`${g.key}:${g.name}:${g.vertical}`} group={g} onSaved={()=>router.refresh()} setLoading={setLoading} />
          <p style={{color:'var(--muted)',fontSize:12}}>Platforms share this brand’s content type. Each has its own login, warm-up stage, and daily limit. Enable only after configuring a real handle and checking login.</p>
          {!g.accounts.length && <p>No platforms connected. Add a platform above to get started.</p>}
          <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 12, marginTop: 10 }}>
            {g.accounts.map((a) => (
              <AccountCard key={`${a.id}:${a.handle}:${a.warmupStage}:${a.dailyCap}:${a.active}`} account={a} brandKey={g.key} onSaved={() => router.refresh()} setLoading={setLoading} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
