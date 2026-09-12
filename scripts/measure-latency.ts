import { mkdirSync, appendFileSync } from 'node:fs';
const [sessionKey,endedAt]=process.argv.slice(2);
if(!sessionKey||!/^\d+$/.test(sessionKey)||!endedAt||!Number.isFinite(Date.parse(endedAt)))throw new Error('usage: pnpm latency SESSION_KEY SESSION_END_ISO');
const start=Date.now();const deadline=start+Number(process.env.LATENCY_MAX_MINUTES??120)*60000;
mkdirSync('.data',{recursive:true});
while(Date.now()<deadline){
  const now=new Date();
  try{
    const res=await fetch(`https://api.openf1.org/v1/session_result?session_key=${sessionKey}`,{signal:AbortSignal.timeout(8000)});
    const data=await res.json();const available=res.ok&&Array.isArray(data)&&data.length>0;
    const row={at:now.toISOString(),sessionKey,available,status:res.status,secondsAfterEnd:(now.getTime()-Date.parse(endedAt))/1000};
    appendFileSync(`.data/latency-${sessionKey}.jsonl`,JSON.stringify(row)+'\n');console.log(JSON.stringify(row));
    if(available)break;
  }catch(e){console.error((e as Error).message);}
  await new Promise(r=>setTimeout(r,10000));
}
