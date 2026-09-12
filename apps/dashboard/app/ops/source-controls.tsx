'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function SourceControl({ sourceKey, active }: { sourceKey: string; active: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <><button disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'source', key: sourceKey, active: !active }) });
      if (!res.ok) throw new Error((await res.json()).error); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>{active ? 'Pause' : 'Resume'}</button>{error && <span role="alert">{error}</span>}</>;
}
export function RetractControl({ postId, live }: { postId: string; live: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <><button disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'retract', postId }) });
      if (!res.ok) throw new Error((await res.json()).error); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>{live ? 'Request removal' : 'Cancel'}</button>{error && <span role="alert">{error}</span>}</>;
}
