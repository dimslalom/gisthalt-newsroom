import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '@newsroom/db';
import { GeminiRouter, validateQuote, writeCaption } from '@newsroom/llm';
import { contentHash, dedupeHash, domainMatches, evaluateGate, quoteSupports, type Claim } from '@newsroom/core';
import { extractItem, gateClaim, approve, approveF1Launch, reject, holdForSecondSource, releaseHeldIfCorroborated, enqueuePost, reservePost, finishPost, seedAccounts, editCaption, assessReadiness, updateOps, attachResultsCarousel, type Ctx } from '@newsroom/pipeline';
import { brandByKey } from '@newsroom/brands';
import { chooseArchetype, isLayoutShippable } from '@newsroom/design';
import { editablePostDoc, editPostCaption, renderPostDesign } from '@newsroom/pipeline';
import { renderRemote } from '@newsroom/render';
import { regenerateRecentF1Reviews } from '@newsroom/pipeline';
vi.mock('@newsroom/render', async (load) => ({ ...await load<object>(), renderRemote: vi.fn(async () => ({path:'/data/renders/test.png',guards:{},url:'/renders/test.png'})) }));
const now=new Date('2026-09-12T12:00:00Z');
function context():Ctx {const store=new Store();return {store,router:new GeminiRouter(store,''),now:()=>new Date(now)};}
function item(ctx:Ctx, domain='autosport.com', tier:'A'|'B'|'C'='B', imageUrl:string|null=null) {
  return ctx.store.insertItem({sourceKey:domain,externalId:domain,contentHash:domain,preKey:'same',vertical:'f1',tier,sourceDomain:domain,rawUrl:`https://${domain}/story`,title:'Norris signs for 2027',body:'Norris signs for 2027.',payload:{claimType:'article'},fetchedAt:now,observedAt:now,imageUrl})!;
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
describe('regenerating recent F1 reviews', () => {
  it('reopens recent expired reviews without publishing or losing history', async () => {
    const ctx = context(); const comp = composition(ctx); gateClaim(ctx, ctx.store.getClaim(comp.claimId)!);
    const old = ctx.store.reviews[0]!; old.compositionId = comp.id;
    ctx.now = () => new Date(now.getTime() + 2 * 60 * 60000);
    const result = await regenerateRecentF1Reviews(ctx);
    expect(result.regenerated).toBe(1); expect(old.state).toBe('expired');
    expect(ctx.store.reviews).toHaveLength(2); expect(ctx.store.pendingReviews(ctx.now())).toHaveLength(1);
    expect(ctx.store.posts).toHaveLength(0);
    editCaption(ctx, comp.id, 'x', 'Fresh manual caption');
    expect(comp.captionByPlatform.x).toBe('Fresh manual caption');
    expect((await regenerateRecentF1Reviews(ctx)).regenerated).toBe(0);
  });
  it('does not revive rejected reviews or source claims older than 24 hours', async () => {
    const ctx = context(); const comp = composition(ctx); gateClaim(ctx, ctx.store.getClaim(comp.claimId)!);
    ctx.store.reviews[0]!.state = 'rejected';
    expect((await regenerateRecentF1Reviews(ctx)).regenerated).toBe(0);
    ctx.store.reviews[0]!.state = 'expired'; ctx.now = () => new Date(now.getTime() + 25 * 60 * 60000);
    expect((await regenerateRecentF1Reviews(ctx)).regenerated).toBe(0);
  });
  it('does not revive dropped claims or already queued content', async () => {
    const ctx = context(); const comp = composition(ctx); gateClaim(ctx, ctx.store.getClaim(comp.claimId)!);
    ctx.store.reviews[0]!.state = 'expired'; enqueuePost(ctx, comp, ['x']);
    expect((await regenerateRecentF1Reviews(ctx)).regenerated).toBe(0);
    ctx.store.posts[0]!.status = 'cancelled'; ctx.store.decisions[0]!.outcome = 'drop';
    expect((await regenerateRecentF1Reviews(ctx)).regenerated).toBe(0);
  });
});
describe('manual post editor', () => {
  it('makes the ticker editable without duplication or reviving a deleted bar', () => {
    const raw = { id: 'test', canvas: 'portrait-4x5', root: { kind: 'frame', id: 'root', name: 'Root', axis: 'vertical', children: [] } };
    const first = editablePostDoc(raw, ['ticker', 'grain'], 8);
    expect(first.accents).toEqual(['grain']);
    expect(first.doc.root.children[0]!.name).toBe('Lower bar');
    expect(editablePostDoc(first.doc, ['ticker'], 8).doc.root.children).toHaveLength(1);
    first.doc.root.children = [];
    expect(editablePostDoc(first.doc, ['ticker'], 8).doc.root.children).toHaveLength(0);
    expect(raw.root.children).toHaveLength(0);
  });
  it('saves captions after review expiry without approving or queueing', () => {
    const ctx = context(); const comp = composition(ctx);
    gateClaim(ctx, ctx.store.getClaim(comp.claimId)!);
    ctx.now = () => new Date(now.getTime() + 91 * 60000);
    editPostCaption(ctx, comp.id, 'x', 'Updated manual caption');
    expect(comp.captionByPlatform.x).toBe('Updated manual caption');
    expect(ctx.store.posts).toHaveLength(0);
    expect(ctx.store.reviews[0]!.state).toBe('pending');
  });
  it('rejects invalid documents without changing the saved artwork', async () => {
    const ctx = context(); const comp = composition(ctx);
    await expect(renderPostDesign(ctx, comp.id, {})).rejects.toThrow('document rejected');
    expect(comp.imagePaths).toEqual(['test.png']);
  });
  it('re-renders only this composition and preserves its accents', async () => {
    const ctx = context(); const comp = composition(ctx); comp.accents = ['grain'];
    const { id: originalId, ...copy } = comp;
    const other = ctx.store.insertComposition(copy);
    const result = await renderPostDesign(ctx, comp.id, null);
    expect(renderRemote).toHaveBeenLastCalledWith(expect.objectContaining({ accents: ['grain'], layout: comp.layout }));
    expect(result.imagePaths).toEqual(['/data/renders/test.png']);
    expect(other.imagePaths).toEqual(['test.png']);
    expect(ctx.store.posts).toHaveLength(0);
  });
  it('blocks mutation while a publication is unresolved', async () => {
    const ctx = context(); const comp = composition(ctx);
    enqueuePost(ctx, comp, ['x']); ctx.store.posts[0]!.status = 'uncertain';
    expect(() => editPostCaption(ctx, comp.id, 'x', 'Changed')).toThrow('unresolved publication');
    await expect(renderPostDesign(ctx, comp.id, null)).rejects.toThrow('unresolved publication');
  });
  it('does not replace a carousel with one edited slide', async () => {
    const ctx = context(); const comp = composition(ctx); comp.imagePaths.push('slide-two.png');
    await expect(renderPostDesign(ctx, comp.id, null)).rejects.toThrow('carousel');
    expect(comp.imagePaths).toHaveLength(2);
  });
});
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
  it('keeps the source photo on an unextracted claim when the model returns a malformed response',async()=>{
    const ctx=context();
    const i=item(ctx,'autosport.com','B','https://cdn-1.motorsport.com/images/amp/6DGg7DDY/s6/photo.jpg');
    vi.spyOn(ctx.router,'call').mockResolvedValue({json:{entities:'not-an-object'},offline:false,model:'test',cached:false} as never);
    await extractItem(ctx,i);
    const claim=ctx.store.claims[0]!;
    expect(claim.tags).toContain('unextracted');
    expect(claim.imageUrl).toBe('https://cdn-1.motorsport.com/images/amp/6DGg7DDY/s6/photo.jpg');
  });
  it('stores a claim type its brand has no archetype for as an article, and only offers the brand\'s types',async()=>{
    const ctx=context();
    const i=item(ctx);
    const call=vi.spyOn(ctx.router,'call').mockResolvedValue({json:{claimType:'release',entities:{driver:'Norris'},values:{},supportingQuote:null,headline:'Norris teken kontrak baru bersama McLaren',tags:[]},offline:false,model:'test',cached:false} as never);
    await extractItem(ctx,i);
    const c=ctx.store.claims[0]!;
    expect(c.claimType).toBe('article');
    expect(c.dedupeHash).toBe(dedupeHash({vertical:'f1',claimType:'article',entities:c.entities,values:c.values}));
    expect(()=>chooseArchetype(brandByKey('f1'),c.claimType)).not.toThrow();
    const prompt=(call.mock.calls[0]![0] as {prompt:string}).prompt;
    expect(prompt).toMatch(/claimType is one of: [^\n]*driver_line/);
    expect(prompt).not.toMatch(/claimType is one of: [^\n]*\brelease\b/);
  });
  it('falls back to a Google image search when a genuinely new prose claim has no photo of its own',async()=>{
    const ctx=context();
    const i=item(ctx,'racefans.net','B',null);
    vi.spyOn(ctx.router,'call').mockResolvedValue({json:{claimType:'article',entities:{},values:{},supportingQuote:null,headline:'Race report',tags:[]},offline:false,model:'test',cached:false} as never);
    vi.stubEnv('GOOGLE_CSE_API_KEY','key');vi.stubEnv('GOOGLE_CSE_ID','cse');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({items:[{link:'https://example.com/fallback.jpg'}]}),{status:200})));
    await extractItem(ctx,i);
    expect(ctx.store.claims[0]!.imageUrl).toBe('https://example.com/fallback.jpg');
    vi.unstubAllGlobals();
  });
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
describe('auto-attaching a results carousel',()=>{
  function articleClaim(ctx:Ctx,headline:string) {
    const i=ctx.store.insertItem({sourceKey:'racefans.net',externalId:headline,contentHash:headline,preKey:headline,vertical:'f1',tier:'B',sourceDomain:'racefans.net',rawUrl:'https://racefans.net/r1',title:headline,body:'',payload:{claimType:'article'},fetchedAt:now,observedAt:now,imageUrl:null})!;
    return ctx.store.upsertClaim({itemId:i.id,vertical:'f1',claimType:'article',entities:{},values:{},supportingQuote:null,headline,imageUrl:null,tags:['headline:id'],sourceTier:'B',sourceDomain:'racefans.net',extractedBy:'gemini',dedupeHash:`article-${headline}`,observedAt:now,createdAt:now}).claim;
  }
  function tierAClaim(ctx:Ctx,claimType:string,hash:string) {
    const i=ctx.store.insertItem({sourceKey:'openf1',externalId:hash,contentHash:hash,preKey:hash,vertical:'f1',tier:'A',sourceDomain:'api.openf1.org',rawUrl:null,title:'',body:'',payload:{claimType},fetchedAt:now,observedAt:now,imageUrl:null})!;
    return ctx.store.upsertClaim({itemId:i.id,vertical:'f1',claimType,entities:{},values:{rows:[]},supportingQuote:null,headline:claimType,imageUrl:null,tags:['structured'],sourceTier:'A',sourceDomain:'api.openf1.org',extractedBy:'structured',dedupeHash:hash,observedAt:now,createdAt:now}).claim;
  }
  function pendingReview(ctx:Ctx,claimId:string) {
    return ctx.store.insertReview({claimId,compositionId:null,state:'pending',rule:'R4',reason:'test',createdAt:now,expiresAt:new Date(now.getTime()+90*60000),resolvedAt:null,note:null});
  }
  function activateF1X(ctx:Ctx) { seedAccounts(ctx); const a=ctx.store.getAccount('f1-x')!; a.active=true; a.warmupStage=1; a.dailyCap=3; }
  afterEach(()=>vi.unstubAllGlobals());

  it('attaches classification and standings slides and rejects the original single-image review',async()=>{
    const ctx=context();activateF1X(ctx);
    const article=articleClaim(ctx,'2026 Spanish Grand Prix race result and championship points');
    tierAClaim(ctx,'classification','class-1');tierAClaim(ctx,'standings','standings-1');
    const review=pendingReview(ctx,article.id);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({images:[{path:'a.png'},{path:'b.png'},{path:'c.png'}],skin:'dark'}),{status:200})));
    expect(await attachResultsCarousel(ctx,article,review.id)).toBe(true);
    expect(ctx.store.getReview(review.id)!.state).toBe('rejected');
    const carouselReview=ctx.store.reviews.find(r=>r.id!==review.id)!;
    expect(carouselReview.state).toBe('pending');
    expect(ctx.store.getComposition(carouselReview.compositionId!)!.imagePaths).toHaveLength(3);
  });

  it('leaves a non-results article alone',async()=>{
    const ctx=context();activateF1X(ctx);
    const article=articleClaim(ctx,'Norris signs contract extension with McLaren');
    tierAClaim(ctx,'classification','class-2');
    const review=pendingReview(ctx,article.id);
    expect(await attachResultsCarousel(ctx,article,review.id)).toBe(false);
    expect(ctx.store.getReview(review.id)!.state).toBe('pending');
  });

  it('leaves the review alone when no matching tier-A claim exists within the window',async()=>{
    const ctx=context();activateF1X(ctx);
    const article=articleClaim(ctx,'Full results and standings from the Spanish Grand Prix');
    const review=pendingReview(ctx,article.id);
    expect(await attachResultsCarousel(ctx,article,review.id)).toBe(false);
    expect(ctx.store.getReview(review.id)!.state).toBe('pending');
  });
});
