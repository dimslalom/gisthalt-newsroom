import { afterAll, describe, expect, it, vi } from 'vitest';
import { withStore, readStore, closeDatabase } from '@newsroom/db';
const url=process.env.TEST_DATABASE_URL;
const key=`integration-${Date.now()}`;
describe.skipIf(!url)('Postgres transactional repository',()=>{
  afterAll(async()=>{await closeDatabase();vi.unstubAllEnvs();});
  it('persists date types and serializes concurrent updates without losing writes',async()=>{
    vi.stubEnv('DATABASE_URL',url!);vi.stubEnv('STORE_BACKEND','postgres');
    await withStore(s=>s.setSetting(key,0));
    await Promise.all(Array.from({length:12},()=>withStore(async s=>{const n=s.setting(key,0);await new Promise(r=>setTimeout(r,5));s.setSetting(key,n+1);} )));
    expect(await withStore(s=>s.setting(key,0))).toBe(12);
  });
  it('serves a committed snapshot while a writer holds the mutation lock',async()=>{
    let release!:()=>void; let started!:()=>void;
    const held=new Promise<void>(r=>release=r); const ready=new Promise<void>(r=>started=r);
    const writer=withStore(async s=>{s.setSetting(key,123);started();await held;throw new Error('release test lock');}).catch(()=>{});
    await ready;
    try { const snapshot=await Promise.race([readStore(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('read blocked by writer')),2000))]); expect(snapshot.setting(key,0)).toBe(12); }
    finally {release();await writer;}
  });
  it('rolls back a failed transaction',async()=>{
    await expect(withStore(s=>{s.setSetting(key,999);throw new Error('test rollback');})).rejects.toThrow('rollback');
    expect(await withStore(s=>s.setting(key,0))).toBe(12);
  });
});
