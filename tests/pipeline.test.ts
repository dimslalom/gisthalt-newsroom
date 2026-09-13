import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '@newsroom/db';
import { GeminiRouter, validateQuote, writeCaption } from '@newsroom/llm';
import { contentHash, domainMatches, evaluateGate, quoteSupports, type Claim } from '@newsroom/core';
import { extractItem, gateClaim, approve, approveF1Launch, reject, holdForSecondSource, releaseHeldIfCorroborated, enqueuePost, reservePost, finishPost, seedAccounts, editCaption, assessReadiness, updateOps, type Ctx } from '@newsroom/pipeline';
import { brandByKey } from '@newsroom/brands';
import { isLayoutShippable } from '@newsroom/design';
vi.mock('@newsroom/render', async (load) => ({ ...await load<object>(), renderRemote: vi.fn(async () => ({path:'/data/renders/test.png',guards:{},url:'/renders/test.png'})) }));
const now=new Date('2026-09-12T12:00:00Z');
function context():Ctx {const store=new Store();return {store,router:new GeminiRouter(store,''),now:()=>new Date(now)};}
function item(ctx:Ctx, domain='autosport.com', tier:'A'|'B'|'C'='B') {
  return ctx.store.insertItem({sourceKey:domain,externalId:domain,contentHash:domain,preKey:'same',vertical:'f1',tier,sourceDomain:domain,rawUrl:`https://${domain}/story`,title:'Norris signs for 2027',body:'Norris signs for 2027.',payload:{claimType:'article'},fetchedAt:now,observedAt:now,imageUrl:null})!;
}
function claim(ctx:Ctx, domain='autosport.com') {
  const i=item(ctx,domain);
  return ctx.store.upsertClaim({itemId:i.id,vertical:'f1',claimType:'driver_line',entities:{driver:'Norris',team:'McLaren'},values:{season:2027},supportingQuote:'Norris signs for 2027.',headline:'Norris signs for 2027',imageUrl:null,tags:[],sourceTier:'B',sourceDomain:domain,extractedBy:'gemini',dedupeHash:'same-fact',observedAt:now,createdAt:now}).claim;
}
function account(ctx:Ctx) {seedAccounts(ctx);const a=ctx.store.getAccount('f1-x')!;a.active=true;a.warmupStage=1;a.dailyCap=3;return a;}
function composition(ctx:Ctx) {
  const c=claim(ctx);account(ctx);
  return ctx.store.insertComposition({claimId:c.id,accountId:'f1-x',archetype:'driver_line',layout:'framed',skin:'dark',accents:[],captionByPlatform:{x:'Norris signs for 2027',instagram:'Norris signs for 2027',threads:'Norris signs for 2027',tiktok:'Norris signs for 2027'},imagePaths:['test.png'],seed:1,renderedAt:now,createdAt:now});
}
afterEach(()=>vi.unstubAllEnvs());
describe('account configuration safety',()=>{
  it('cancels queued posts and pauses platforms when reclassifying a brand',()=>{
    const ctx=context();const comp=composition(ctx);enqueuePost(ctx,comp,['x']);
    updateOps(ctx,{action:'brand',key:'f1',name:'New name',vertical:'film'});
    expect(ctx.store.posts[0]?.status).toBe('cancelled');expect(ctx.store.getAccount('f1-x')?.active).toBe(false);
    expect(()=>enqueuePost(ctx,comp,['x'])).toThrow('content type');
  });
  it('blocks removal and content changes while publication is uncertain',()=>{
    const ctx=context();const comp=composition(ctx);enqueuePost(ctx,comp,['x']);ctx.store.posts[0]!.status='uncertain';
    expect(()=>updateOps(ctx,{action:'platform_remove',key:'f1',platform:'x'})).toThrow('reconcile');
    expect(()=>updateOps(ctx,{action:'brand',key:'f1',name:'New',vertical:'film'})).toThrow('reconcile');
    expect(ctx.store.getAccount('f1-x')?.active).toBe(true);
  });
});
describe('verification integration',()=>{
  it('retains independent evidence when the canonical claim is deduplicated',()=>{const ctx=context();const a=claim(ctx);claim(ctx,'motorsport.com');expect(ctx.store.claims).toHaveLength(1);expect(ctx.store.corroborationFor(a.dedupeHash,a.itemId)).toHaveLength(1);});
  it('does not accept numeric substrings, invented quote suffixes, or lookalike domains',()=>{
    expect(quoteSupports('15 seconds',5)).toBe(false);expect(quoteSupports('1.55 seconds',1.5)).toBe(false);
    expect(validateQuote('Norris signs for 2027 and gets 5 million.',{year:2027,money:5},'Norris signs for 2027.')).toContain('verbatim');
    expect(validateQuote('fabricated wording',{},'Real source.')).toContain('verbatim');
    expect(domainMatches('evilautosport.com','autosport.com')).toBe(false);expect(domainMatches('www.autosport.com','autosport.com')).toBe(true);
  });
  it('structured result corrections change the raw-content hash',()=>{
    const a={sourceKey:'openf1',externalId:'1',title:'Results',body:'',payload:{position:1}};
    expect(contentHash(a)).not.toBe(contentHash({...a,payload:{position:2}}));
  });
  it('structured captions make zero model calls',async()=>{
    const ctx=context();const c=claim(ctx);const call=vi.spyOn(ctx.router,'call');
    const out=await writeCaption(ctx.router,{...c,sourceTier:'A',headline:undefined}, {},'x',280,'Confirmed fields');expect(out.caption).toBe('Confirmed fields');expect(call).not.toHaveBeenCalled();
  });
  it('records an extraction once, including a no-claim tier C signal',async()=>{
    const ctx=context();const i=item(ctx,'reddit.com','C');await extractItem(ctx,i);await extractItem(ctx,i);expect(ctx.store.extractions).toHaveLength(1);
  });
  it('reuses identical prose before paying for a second extraction',async()=>{
    const ctx=context();const a=item(ctx);await extractItem(ctx,a);const b=item(ctx,'motorsport.com');const call=vi.spyOn(ctx.router,'call');await extractItem(ctx,b);expect(call).not.toHaveBeenCalled();expect(ctx.store.evidence).toHaveLength(2);
  });
  it('rejects a missing fixture certification instead of selecting untested layouts',()=>{expect(isLayoutShippable('f1','unknown','framed',null)).toBe(false);});
});
describe('review transitions',()=>{
  it('expires held reviews and rejects stale approval even before a sweep',async()=>{
    const ctx=context();const c=claim(ctx);gateClaim(ctx,c);const r=ctx.store.reviews[0]!;holdForSecondSource(ctx,r.id);ctx.now=()=>new Date(now.getTime()+91*60000);
    await expect(approve(ctx,r.id)).rejects.toThrow('expired');expect(ctx.store.expireStaleReviews(ctx.now())).toHaveLength(1);expect(r.state).toBe('expired');
  });
  it('reject is terminal and repeated approval is idempotent',async()=>{
    vi.stubEnv('PUBLISH_JITTER_MAX_MINUTES','0');const ctx=context();const comp=composition(ctx);gateClaim(ctx,ctx.store.getClaim(comp.claimId)!);const r=ctx.store.reviews[0]!;r.compositionId=comp.id;
    await approve(ctx,r.id);await approve(ctx,r.id);expect(ctx.store.posts).toHaveLength(1);expect(()=>reject(ctx,r.id)).toThrow('approved');expect(()=>editCaption(ctx,comp.id,'x','edited')).toThrow('approved');
  });
  it('held release obeys R3 flag and 45-minute evidence window',async()=>{
    const ctx=context();const comp=composition(ctx);const c=ctx.store.getClaim(comp.claimId)!;gateClaim(ctx,c);const r=ctx.store.reviews[0]!;r.compositionId=comp.id;holdForSecondSource(ctx,r.id);claim(ctx,'motorsport.com');
    expect(await releaseHeldIfCorroborated(ctx)).toEqual([]);
    vi.stubEnv('ENABLE_R3','true');expect(await releaseHeldIfCorroborated(ctx)).toEqual([r.id]);expect(ctx.store.posts).toHaveLength(1);
  });
});
describe('publish reservations',()=>{
  it('rechecks the kill switch and warm-up after queueing',()=>{
    vi.stubEnv('PUBLISH_JITTER_MAX_MINUTES','0');const ctx=context();const comp=composition(ctx);enqueuePost(ctx,comp,['x']);ctx.store.setSetting('killSwitch',true);expect(reservePost(ctx)).toBeNull();ctx.store.setSetting('killSwitch',false);ctx.store.getAccount('f1-x')!.warmupStage=0;expect(reservePost(ctx)).toBeNull();
  });
  it('deduplicates reshuffled posts and permits only one in-flight reservation per account',()=>{
    vi.stubEnv('PUBLISH_JITTER_MAX_MINUTES','0');const ctx=context();const comp=composition(ctx);enqueuePost(ctx,comp,['x']);enqueuePost(ctx,{...comp,id:'reshuffle'},['x']);expect(ctx.store.posts).toHaveLength(1);expect(reservePost(ctx)).not.toBeNull();expect(reservePost(ctx)).toBeNull();
  });
  it('simulated sends are labelled explicitly and counted toward the cap',()=>{
    vi.stubEnv('PUBLISH_JITTER_MAX_MINUTES','0');const ctx=context();const comp=composition(ctx);enqueuePost(ctx,comp,['x']);const r=reservePost(ctx)!;finishPost(ctx,r.job.id,{ok:true,platformPostId:'dry-1',latencyMs:1},true,null);expect(ctx.store.posts[0]!.status).toBe('simulated');expect(ctx.store.postsPublishedToday('f1-x',now)).toBe(1);
  });
  it('never queues a failed or incomplete render',()=>{const ctx=context();const comp=composition(ctx);expect(()=>enqueuePost(ctx,{...comp,renderedAt:null,imagePaths:[]},['x'])).toThrow('rendered');});
});
describe('launch readiness',()=>{
  it('does not allow a placeholder or stage-zero account to be activated',()=>{
    const ctx=context();seedAccounts(ctx);const a=ctx.store.getAccount('f1-x')!;
    expect(()=>updateOps(ctx,{action:'account',id:a.id,handle:'@f1.placeholder',warmupStage:0,dailyCap:0,active:true})).toThrow('real @handle');
    expect(updateOps(ctx,{action:'account',id:a.id,handle:'@gridlamp',warmupStage:1,dailyCap:1,active:true})).toMatchObject({active:true,handle:'@gridlamp'});
  });
  it('fails closed for an unavailable renderer and missing worker heartbeat',()=>{
    const ctx=context();const report=assessReadiness(ctx.store,{now,rendererUp:false,dryRun:true});
    expect(report.level).toBe('fail');expect(report.checks.find(c=>c.key==='renderer')?.level).toBe('fail');expect(report.checks.find(c=>c.key==='worker')?.level).toBe('fail');
  });
  it('requires a fresh agent, configured account, and healthy session before live mode is ready',()=>{
    const ctx=context();const a=account(ctx);a.handle='@gridlamp';a.profileDir='C:/profiles/f1-x';ctx.store.setSetting('workerHeartbeat',now);ctx.store.setSetting('agentHeartbeat',now);
    ctx.store.upsertSession({accountId:a.id,lastOkAt:now,lastCheckAt:now,healthy:true,lastScreenshotPath:null});ctx.store.sources.push({id:'source',key:'openf1',vertical:'f1',tier:'A',cadenceSeconds:30,lastSuccessAt:now,lastErrorAt:null,lastError:null,itemsSeen:1,cursor:null,active:true});
    expect(assessReadiness(ctx.store,{now,rendererUp:true,dryRun:false}).level).toBe('pass');
  });
  it('blocks a launch when a post outcome is uncertain',()=>{
    const ctx=context();ctx.store.posts.push({id:'post',compositionId:'comp',accountId:'f1-x',platform:'x',status:'uncertain',idempotencyKey:'key',platformPostId:null,scheduledFor:null,publishedAt:null,latencyMs:null,error:null,archivePath:null});
    expect(assessReadiness(ctx.store,{now,rendererUp:true,dryRun:true}).checks.find(c=>c.key==='reconciliation')?.level).toBe('fail');
  });
});
describe('controlled F1 launch',()=>{
  it('queues exactly X, Instagram, and TikTok for one approved F1 review',async()=>{
    vi.stubEnv('PUBLISH_JITTER_MAX_MINUTES','0');const ctx=context();const comp=composition(ctx);seedAccounts(ctx);
    for(const platform of ['x','instagram','tiktok']) { const a=ctx.store.accounts.find(a=>a.brand==='f1'&&a.platform===platform)!;a.active=true;a.handle=`@f1_${platform}`;a.warmupStage=1;a.dailyCap=3;ctx.store.upsertSession({accountId:a.id,lastOkAt:now,lastCheckAt:now,healthy:true,lastScreenshotPath:null}); }
    gateClaim(ctx,ctx.store.getClaim(comp.claimId)!);const review=ctx.store.reviews[0]!;review.compositionId=comp.id;
    await approveF1Launch(ctx,review.id);
    expect(ctx.store.posts.map(p=>p.platform).sort()).toEqual(['instagram','tiktok','x']);
  });
  it('refuses the launch when a required F1 platform has not been activated',async()=>{
    const ctx=context();const comp=composition(ctx);gateClaim(ctx,ctx.store.getClaim(comp.claimId)!);const review=ctx.store.reviews[0]!;review.compositionId=comp.id;
    await expect(approveF1Launch(ctx,review.id)).rejects.toThrow('instagram');
  });
});
