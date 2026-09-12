import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { brands } from '@newsroom/brands';
import { SKINS, designFingerprint, type CompositionSpec } from '@newsroom/design';
import { closePool, compareToGolden, loadAllFixtures, renderComposition } from '@newsroom/render';
const args=process.argv.slice(2);const update=args.includes('--update');const only=args.find(a=>a.startsWith('--fixture='))?.split('=')[1];
const fixtures=loadAllFixtures().filter(f=>!only||f.name===only);
if(!fixtures.length)throw new Error('no fixtures selected');
const out=resolve('.data/goldens'),golden=resolve('fixtures/goldens');mkdirSync(out,{recursive:true});mkdirSync(golden,{recursive:true});
const jobs=brands.flatMap(brand=>brand.archetypes.flatMap(archetype=>archetype.layouts.flatMap(layout=>fixtures.map(fixture=>({brand,archetype,layout,fixture})))));
const results:{brand:string;archetype:string;layout:string;fixture:string;ok:boolean;error?:string}[]=[];
let cursor=0;
await Promise.all(Array.from({length:Number(process.env.GOLDEN_CONCURRENCY ?? 2)},async()=>{
  while(cursor<jobs.length){const {brand,archetype,layout,fixture}=jobs[cursor++]!;
    const name=`${brand.key==='f1'?'':`${brand.key}__`}${archetype.key}__${layout}__${fixture.name}.png`;
    try{
      const claim=brand.key==='f1'?fixture.claim:{...fixture.claim,vertical:brand.vertical,claimType:archetype.claimTypes[0]!};
      const spec:CompositionSpec={brand,archetype,layout,skin:SKINS[0]!,accents:[],model:archetype.model(claim)};
      const actual=await renderComposition(spec,{outDir:out,imagePath:fixture.imagePath,fileName:name});
      if(update)writeFileSync(resolve(golden,name),readFileSync(actual.path));
      const diff=compareToGolden(actual.path,resolve(golden,name),{maxRatio:0.002,writeDiff:resolve(out,`diff-${name}`)});
      if (diff.match && process.env.KEEP_GOLDEN_ACTUAL !== '1') unlinkSync(actual.path);
      results.push({brand:brand.key,archetype:archetype.key,layout,fixture:fixture.name,ok:diff.match,error:diff.match?undefined:`drift ${diff.ratio}`});
    }catch(e){results.push({brand:brand.key,archetype:archetype.key,layout,fixture:fixture.name,ok:false,error:(e as Error).message});}
    if(results.length%60===0)console.log(`${results.length}/${jobs.length} renders checked`);
  }
}));
await closePool();
const passing:Record<string,string[]>={};
for(const brand of brands)for(const a of brand.archetypes)passing[a.key]=a.layouts.filter(l=>{const rows=results.filter(r=>r.brand===brand.key&&r.archetype===a.key&&r.layout===l);return rows.length===fixtures.length&&rows.every(r=>r.ok);});
// A focused check must never certify the untested rest of the fixture library.
if(!only)writeFileSync(resolve('fixtures/passing.json'),JSON.stringify({generatedAt:new Date().toISOString(),runtime:process.platform,fingerprint:designFingerprint(),fixtures:fixtures.map(f=>f.name),passing},null,2));
const failures=results.filter(r=>!r.ok);for(const f of failures)console.error(JSON.stringify(f));
console.log(`${results.length-failures.length}/${results.length} passed`);
if(failures.length)process.exitCode=1;
