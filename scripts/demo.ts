import { withCtx, seedAccounts, composeClaim, gateClaim, type Ctx } from '@newsroom/pipeline';
import { loadFixture } from '@newsroom/render';
import { contentHash, dedupeHash, preExtractionKey, type Claim, type RawItem } from '@newsroom/core';
import { closeDatabase } from '@newsroom/db';
const fixture=loadFixture('classification-basic');
/** Demo creates preview drafts only; it never enables an account or queues a post. */
function insert(ctx:Ctx, claim:Claim, key:string) {
  const raw:RawItem={sourceKey:'demo',externalId:key,vertical:claim.vertical,tier:claim.sourceTier,sourceDomain:claim.sourceDomain,rawUrl:null,title:claim.headline??key,body:claim.supportingQuote??'',payload:{...claim.values},observedAt:claim.observedAt};
  const item=ctx.store.items.find(i=>i.sourceKey==='demo'&&i.externalId===key)??ctx.store.insertItem({...raw,fetchedAt:ctx.now(),contentHash:contentHash(raw),preKey:preExtractionKey(raw),imageUrl:null})!;
  const row=ctx.store.upsertClaim({itemId:item.id,vertical:claim.vertical,claimType:claim.claimType,entities:claim.entities,values:claim.values,supportingQuote:claim.supportingQuote,headline:claim.headline??key,imageUrl:null,tags:['demo'],sourceTier:claim.sourceTier,sourceDomain:claim.sourceDomain,extractedBy:'recorded-fixture',dedupeHash:dedupeHash(claim),observedAt:claim.observedAt,createdAt:ctx.now()}).claim;
  if(!ctx.store.extractions.some(e=>e.itemId===item.id))ctx.store.extractions.push({id:item.id,itemId:item.id,processedAt:ctx.now(),claimIds:[row.id]});
  return row;
}
try {
  await withCtx(seedAccounts);
  const f1=await withCtx(ctx=>insert(ctx,{...fixture.claim,tags:['demo']},'recorded-openf1'));
  for(let i=0;i<60;i++) {
    await withCtx(async ctx=>{if(ctx.store.compositions.filter(c=>c.claimId===f1.id&&c.renderedAt).length>i)return;await composeClaim(ctx,ctx.store.getClaim(f1.id)!,'f1-x',i+1);});
    if((i+1)%10===0)console.log(`${i+1}/60 historical-data preview treatments ready`);
  }
  for(const vertical of ['vct','film'] as const) {
    await withCtx(async ctx=>{
      const claim:Claim=vertical==='vct'?{vertical,claimType:'match_result',entities:{team1:'Tim Contoh A',team2:'Tim Contoh B',tournament:'DEMO'},values:{score1:2,score2:1,eventId:'demo'},headline:'[DEMO] Hasil pertandingan',sourceTier:'B',sourceDomain:'demo.invalid',supportingQuote:null,observedAt:ctx.now()}:{vertical,claimType:'release',entities:{title:'Film Contoh'},values:{releaseDate:'2026-12-01',tmdbId:'demo'},headline:'[DEMO] Tanggal rilis',sourceTier:'B',sourceDomain:'demo.invalid',supportingQuote:null,observedAt:ctx.now()};
      const row=insert(ctx,claim,vertical);const comp=await composeClaim(ctx,row,`${vertical}-x`);
      if(!ctx.store.decisions.some(d=>d.claimId===row.id))gateClaim(ctx,row);
      const review=ctx.store.reviews.find(r=>r.claimId===row.id);if(review)review.compositionId=comp.id;
    });
  }
  console.log('Demo ready: 60 recorded-result design treatments and two clearly labelled review examples. No posts queued.');
} finally {await closeDatabase();}
