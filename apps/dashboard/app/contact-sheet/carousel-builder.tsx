'use client';
import { useState } from 'react';
export function CarouselBuilder({claims}:{claims:{id:string;label:string}[]}) {
  const [selected,setSelected]=useState<string[]>([]); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  async function create() { setBusy(true); try {const res=await fetch('/api/carousel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({claimIds:selected})});const out=await res.json();if(!res.ok)throw new Error(out.error);setMessage('Carousel rendered. Open the review queue to inspect every slide.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);} }
  return <div className="card"><h3>Build a carousel</h3><p>Select 2–6 claims from one brand, in slide order. A cover and outro are added.</p><select multiple aria-label="Carousel claims" value={selected} onChange={(e)=>setSelected(Array.from(e.target.selectedOptions,o=>o.value))} style={{width:'100%',height:120}}>{claims.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select><button onClick={create} disabled={busy||selected.length<2||selected.length>6}>{busy?'Rendering slides…':'Create review draft'}</button><p role="status">{message}</p></div>;
}
