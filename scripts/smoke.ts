import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { closeDatabase } from '@newsroom/db';
import { contentHash, dedupeHash, preExtractionKey, type Claim, type RawItem } from '@newsroom/core';
import { loadFixture } from '@newsroom/render';
import { withCtx, seedAccounts, gateClaim, composeClaim, enqueuePost, publishNext, approve, createCarousel, reject, type Ctx } from '@newsroom/pipeline';

// Isolated persisted test state. No configured account, token or browser is used.
const runDir = resolve('.data/smoke', randomUUID()); mkdirSync(runDir, { recursive: true });
Object.assign(process.env, { STORE_BACKEND:'file', STORE_FILE:resolve(runDir,'store.json'), PUBLISH_DRY_RUN:'true', PUBLISH_KILL_SWITCH:'false', PUBLISH_JITTER_MAX_MINUTES:'0', LIVE_WINDOW:'1', GEMINI_API_KEY:'', ENABLE_R2:'false', ENABLE_R3:'false', ARCHIVE_DIR:resolve(runDir,'archive') });
function insert(ctx: Ctx, claim: Claim, key: string) {
  const now = ctx.now();
  const raw: RawItem = { sourceKey:'smoke', externalId:key, vertical:claim.vertical, tier:claim.sourceTier, sourceDomain:claim.sourceDomain, rawUrl:null, title:claim.headline ?? key, body:claim.supportingQuote ?? '', payload:claim.values, observedAt:now };
  const item = ctx.store.insertItem({ ...raw, fetchedAt:now, contentHash:contentHash(raw), preKey:preExtractionKey(raw), imageUrl:null })!;
  return ctx.store.upsertClaim({ itemId:item.id, vertical:claim.vertical, claimType:claim.claimType, entities:claim.entities, values:claim.values, supportingQuote:claim.supportingQuote, headline:claim.headline ?? key, imageUrl:null, tags:['demo'], sourceTier:claim.sourceTier, sourceDomain:claim.sourceDomain, extractedBy:'smoke-fixture', dedupeHash:dedupeHash(claim), observedAt:now, createdAt:now }).claim;
}
try {
  await withCtx(ctx => { seedAccounts(ctx); for (const a of ctx.store.accounts) { a.active=true; a.warmupStage=1; a.dailyCap=3; } });
  const fixture = loadFixture('classification-basic').claim;
  const samples: Claim[] = [fixture,
    { vertical:'vct', claimType:'match_result', entities:{team1:'Demo A',team2:'Demo B',tournament:'Test'}, values:{score1:2,score2:1,eventId:'smoke'}, supportingQuote:null, sourceTier:'A',sourceDomain:'vlr.gg',observedAt:new Date(),headline:'[DEMO] Demo A 2–1 Demo B' },
    { vertical:'film', claimType:'release', entities:{title:'Film Contoh'}, values:{releaseDate:'2026-12-01',tmdbId:'smoke'}, supportingQuote:null,sourceTier:'B',sourceDomain:'demo.invalid',observedAt:new Date(),headline:'[DEMO] Film Contoh' }];
  const ids: string[]=[];
  for (const claim of samples) {
    const id = await withCtx(async ctx => {
      const row=insert(ctx,claim,claim.vertical); const decision=gateClaim(ctx,row);
      const comp=await composeClaim(ctx,row,`${claim.vertical}-x`);
      assert.equal(comp.imagePaths.length,1);
      if(decision.outcome==='review') { const r=ctx.store.reviews.find(r=>r.claimId===row.id)!; r.compositionId=comp.id; await approve(ctx,r.id); await approve(ctx,r.id); }
      else { assert.equal(decision.outcome,'auto'); assert.equal(enqueuePost(ctx,comp,['x','instagram','threads','tiktok']).queued,4); }
      return row.id;
    }); ids.push(id);
  }
  for(let i=0;i<12;i++) assert.equal((await publishNext()).published,true);
  assert.equal((await publishNext()).published,false);
  await withCtx(async ctx => {
    assert.equal(ctx.store.posts.length,12);
    for(const p of ctx.store.posts) { assert.equal(p.status,'simulated'); assert.ok(p.archivePath); const metadata=JSON.parse(readFileSync(resolve(p.archivePath!,'post.json'),'utf8')); for(const name of metadata.imagePaths) assert.ok(existsSync(resolve(p.archivePath!,name))); }
    assert.equal(ctx.store.modelUsage.length,0);
    const other=insert(ctx,{...fixture,headline:'Second recorded result',values:{...fixture.values,eventId:'second'}},'second');
    const carousel=await createCarousel(ctx,[ids[0]!,other.id]); assert.equal(carousel.composition.imagePaths.length,4);
    for(const path of carousel.composition.imagePaths) { const local=existsSync(path)?path:resolve(process.env.RENDER_OUT_DIR??'.data/renders',path.split('/').at(-1)!); const m=await sharp(local).metadata();assert.equal(m.width,1080);assert.equal(m.height,1350); }
    reject(ctx,carousel.review.id);
  });
  console.log(JSON.stringify({ok:true,platformSimulations:12,brands:3,carouselSlides:4,modelCalls:0,state:runDir}));
} finally { await closeDatabase(); }
