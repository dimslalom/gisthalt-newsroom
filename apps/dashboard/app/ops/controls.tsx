'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
type Account = { id: string; handle: string; brand: string; platform: string; warmupStage: number; dailyCap: number; active: boolean };
export function Controls({ killed, accounts }: { killed: boolean; accounts: Account[] }) {
  const router = useRouter(); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function send(body: object) {
    setBusy(true); setError('');
    try { const res = await fetch('/api/ops', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) }); const out = await res.json(); if (!res.ok) throw new Error(out.error); router.refresh(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="card"><div className="row"><button className={killed ? 'primary' : 'danger'} disabled={busy} onClick={() => send({action:'kill',enabled:!killed})}>{killed ? 'Resume queue' : 'Pause all publishing'}</button><span className="tag">{killed ? 'Publishing paused' : 'Queue enabled'}</span></div>
    {error && <p role="alert">{error}</p>}
    <h3>Account settings</h3>
    {accounts.map((a) => <form key={`${a.id}:${a.warmupStage}:${a.active}:${a.dailyCap}`} className="row" style={{marginTop:12}} onSubmit={(e) => {e.preventDefault(); const d=new FormData(e.currentTarget); void send({action:'account',id:a.id,handle:d.get('handle'),warmupStage:Number(d.get('stage')),dailyCap:Number(d.get('cap')),active:d.get('active')==='on'});}}>
      <span style={{width:140}}>{a.brand} · {a.platform}</span>
      <input name="handle" aria-label={`${a.id} handle`} defaultValue={a.handle} />
      <select name="stage" aria-label={`${a.id} warm-up`} defaultValue={a.warmupStage}>{['Manual only','Week 3 · up to 3','Week 4 · up to 6','Weeks 5–6 · up to 9','Steady · up to 16'].map((label,i)=><option key={i} value={i}>{label}</option>)}</select>
      <input name="cap" type="number" aria-label={`${a.id} daily cap`} min="0" max="16" style={{width:70}} defaultValue={a.dailyCap}/>
      <label><input name="active" type="checkbox" defaultChecked={a.active}/> Active</label><button disabled={busy}>Save</button>
    </form>)}
  </div>;
}
