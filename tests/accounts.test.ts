import { describe, it, expect } from 'vitest';
import { Store } from '@newsroom/db';
import { GeminiRouter } from '@newsroom/llm';
import { seedAccounts, updateOps, type Ctx } from '@newsroom/pipeline';
import { workspaceBrand, platformsForBrand } from '@newsroom/brands';
function context(): Ctx { const store = new Store(); return { store, router:new GeminiRouter(store,''), now:()=>new Date() }; }
describe('editable publishing brands',()=>{
  it('persists a renamed and reclassified identity without changing profiles',()=>{
    const ctx=context(); seedAccounts(ctx); const before={...ctx.store.getAccount('f1-x')!};
    updateOps(ctx,{action:'brand',key:'f1',name:'New newsroom',vertical:'film'});
    const restored=new Store(); restored.hydrate(ctx.store.snapshot());
    expect(workspaceBrand(restored,'f1')).toEqual({key:'f1',name:'New newsroom',vertical:'film'});
    expect(restored.getAccount('f1-x')?.profileDir).toBe(before.profileDir);
  });
  it('does not recreate removed platforms on startup, and restores the same profile when added',()=>{
    const ctx=context(); seedAccounts(ctx); const a=ctx.store.getAccount('f1-x')!; a.handle='@owner'; a.active=true;
    updateOps(ctx,{action:'platform_remove',key:'f1',platform:'x'}); seedAccounts(ctx);
    expect(platformsForBrand(ctx.store,'f1')).not.toContain('x'); expect(a.active).toBe(false);
    expect(()=>updateOps(ctx,{action:'account',id:a.id,warmupStage:0,dailyCap:0,active:false})).toThrow('removed');
    updateOps(ctx,{action:'platform_add',key:'f1',platform:'x'});
    expect(platformsForBrand(ctx.store,'f1')).toContain('x'); expect(ctx.store.getAccount(a.id)?.handle).toBe('@owner'); expect(ctx.store.accounts.filter(x=>x.id===a.id)).toHaveLength(1);
  });
  it('validates names, types, and platforms',()=>{
    const ctx=context();
    expect(()=>updateOps(ctx,{action:'brand',key:'f1',name:' ',vertical:'f1'})).toThrow();
    expect(()=>updateOps(ctx,{action:'brand',key:'f1',name:'Name',vertical:'unknown'})).toThrow();
    expect(()=>updateOps(ctx,{action:'platform_add',key:'f1',platform:'unknown'})).toThrow();
  });
});
