'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function Controls({ killed }: { killed: boolean }) {
  const router = useRouter(); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function send(body: object) {
    setBusy(true); setError('');
    try { const res = await fetch('/api/ops', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) }); const out = await res.json(); if (!res.ok) throw new Error(out.error); router.refresh(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="card"><div className="row"><button className={killed ? 'primary' : 'danger'} disabled={busy} onClick={() => send({action:'kill',enabled:!killed})}>{killed ? 'Resume queue' : 'Pause all publishing'}</button><span className="tag">{killed ? 'Publishing paused' : 'Queue enabled'}</span></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
