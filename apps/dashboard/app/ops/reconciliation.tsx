'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function Reconciliation({posts}:{posts:{id:string;status:string;platform:string}[]}) {
  const router=useRouter();const [message,setMessage]=useState('');
  return <div className="card"><h3>Resolve interrupted publishing</h3><p>Check the platform first. An uncertain submission is never automatically retried.</p>{posts.map(p=><form className="row" style={{marginTop:8}} key={p.id} onSubmit={async e=>{e.preventDefault();const d=new FormData(e.currentTarget);try{const res=await fetch('/api/ops',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:d.get('outcome')==='retry'?'retry':'reconcile',id:p.id,outcome:d.get('outcome'),platformPostId:d.get('url')})});const out=await res.json();if(!res.ok)throw new Error(out.error);router.refresh();}catch(e){setMessage((e as Error).message);}}}>
    <span>{p.platform} · {p.status} · {p.id.slice(0,8)}</span><select name="outcome" aria-label="Verified outcome"><option value="published">Confirmed live</option><option value="not_published">Confirmed not published — cancel</option><option value="removed">Removed from platform</option>{p.status==='failed'&&<option value="retry">Retry pre-submit failure</option>}</select><input name="url" aria-label="Platform URL" placeholder="Confirmed post URL or ID"/><button>Save outcome</button>
  </form>)}<p role="status">{message}</p></div>;
}
