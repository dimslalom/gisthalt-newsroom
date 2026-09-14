import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { brands, brandByKey } from '@newsroom/brands';
import { SKINS, sharedFingerprint, layoutFingerprint, resolvedLayouts, type CompositionSpec, type LayoutCertification, type PassingManifest } from '@newsroom/design';
import { closePool, compareToGolden, loadAllFixtures, renderComposition } from '@newsroom/render';
const args=process.argv.slice(2);const update=args.includes('--update');const only=args.find(a=>a.startsWith('--fixture='))?.split('=')[1];
const onlyLayout=args.find(a=>a.startsWith('--layout='))?.split('=')[1]; // "<brand>/<archetype>/<layout>"
const fixtures=loadAllFixtures().filter(f=>!only||f.name===only);
if(!fixtures.length)throw new Error('no fixtures selected');
const out=resolve('.data/goldens'),golden=resolve('fixtures/goldens');mkdirSync(out,{recursive:true});mkdirSync(golden,{recursive:true});
// brandByKey, not the raw `brands` array: a saved theme override (palette or
// font picked in the editor) is a real visual change, and must be certified
// against the same effective brand the renderer actually serves.
const effectiveBrands=brands.map(b=>brandByKey(b.key));
let jobs=effectiveBrands.flatMap(brand=>brand.archetypes.flatMap(archetype=>resolvedLayouts(brand.key,archetype.key,archetype.layouts).flatMap(slot=>fixtures.map(fixture=>({brand,archetype,layout:slot.key,fixture})))));
if(onlyLayout){
  const [brandKey,archetypeKey,layoutKey]=onlyLayout.split('/');
  jobs=jobs.filter(j=>j.brand.key===brandKey&&j.archetype.key===archetypeKey&&j.layout===layoutKey);
  if(!jobs.length)throw new Error(`no matching brand/archetype/layout for --layout=${onlyLayout}`);
}
const results:{brand:string;archetype:string;layout:string;fixture:string;ok:boolean;error?:string}[]=[];
const startedAt=Date.now();
let cursor=0;
await Promise.all(Array.from({length:Number(process.env.GOLDEN_CONCURRENCY ?? 2)},async()=>{
  while(cursor<jobs.length){const {brand,archetype,layout,fixture}=jobs[cursor++]!;
    const name=`${brand.key==='f1'?'':`${brand.key}__`}${archetype.key}__${layout}__${fixture.name}.png`;
    try{
      const claim=brand.key==='f1'?fixture.claim:{...fixture.claim,vertical:brand.vertical,claimType:archetype.claimTypes[0]!};
      const spec:CompositionSpec={brand,archetype,layout,skin:SKINS[0]!,accents:[],model:archetype.model(claim)};
      const actual=await renderComposition(spec,{outDir:out,imagePath:fixture.imagePath,fileName:name,certify:true});
      if(update)writeFileSync(resolve(golden,name),readFileSync(actual.path));
      const diff=compareToGolden(actual.path,resolve(golden,name),{maxRatio:0.002,writeDiff:resolve(out,`diff-${name}`)});
      if (diff.match && process.env.KEEP_GOLDEN_ACTUAL !== '1') unlinkSync(actual.path);
      results.push({brand:brand.key,archetype:archetype.key,layout,fixture:fixture.name,ok:diff.match,error:diff.match?undefined:`drift ${diff.ratio}`});
    }catch(e){results.push({brand:brand.key,archetype:archetype.key,layout,fixture:fixture.name,ok:false,error:(e as Error).message});}
    if(results.length%60===0)console.log(`${results.length}/${jobs.length} renders checked`);
  }
}));
await closePool();
const elapsedMs=Date.now()-startedAt;
console.log(`golden run took ${(elapsedMs/1000).toFixed(1)}s for ${jobs.length} renders`);

// A run may certify only the triples it actually rendered against the
// complete fixture set: `--fixture=` narrows the fixture list and so must
// certify nothing; `--layout=` narrows the job list to whole triples and so
// may certify exactly those, since each still ran every fixture.
const canCertify=!only;
if(canCertify){
  const manifestPath=resolve('fixtures/passing.json');
  const previous:PassingManifest|null=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):null;
  // A stale entry left over from a different `shared` fingerprint simply fails
  // its own fp comparison in isLayoutShippable() the next time it's checked,
  // so merging the old map forward here is safe even across a shared-code change.
  const layoutsOut:Record<string,LayoutCertification> = onlyLayout ? {...(previous?.layouts ?? {})} : {};
  const keysThisRun=new Set(jobs.map(j=>`${j.brand.key}/${j.archetype.key}/${j.layout}`));
  for(const key of keysThisRun){
    const [brandKey,archetypeKey,layoutKey]=key.split('/');
    const rows=results.filter(r=>r.brand===brandKey&&r.archetype===archetypeKey&&r.layout===layoutKey);
    const ok=rows.length===fixtures.length&&rows.every(r=>r.ok);
    layoutsOut[key]={fp:layoutFingerprint(brandKey!,archetypeKey!,layoutKey!),ok};
  }
  writeFileSync(manifestPath,JSON.stringify({generatedAt:new Date().toISOString(),runtime:process.platform,fixtures:fixtures.map(f=>f.name),shared:sharedFingerprint(),layouts:layoutsOut} satisfies PassingManifest,null,2));
}
const failures=results.filter(r=>!r.ok);for(const f of failures)console.error(JSON.stringify(f));
console.log(`${results.length-failures.length}/${results.length} passed`);
if(failures.length)process.exitCode=1;
