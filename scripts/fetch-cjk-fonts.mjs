import {writeFileSync,mkdirSync} from 'node:fs';
const dir='packages/render/assets';mkdirSync(dir,{recursive:true});
for(const name of ['NotoSansJP','NotoSansKR']) {
  const url=`https://raw.githubusercontent.com/google/fonts/main/ofl/${name.toLowerCase()}/${name}%5Bwght%5D.ttf`;
  const res=await fetch(url);if(!res.ok)throw new Error(`${name}: ${res.status}`);
  const bytes=Buffer.from(await res.arrayBuffer());writeFileSync(`${dir}/${name}.ttf`,bytes);console.log(`${name}: ${bytes.length} bytes pinned locally`);
}
