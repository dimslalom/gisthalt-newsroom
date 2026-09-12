import { CarouselBuilder } from './carousel-builder.tsx';
import { basename } from 'node:path';
import { store } from '../../lib/store.ts';
import { Sheet } from './sheet.tsx';

export const dynamic = 'force-dynamic';

export default async function ContactSheet({searchParams}:{searchParams:Promise<{brand?:string}>}) {
  const brand=(await searchParams).brand??'f1';
  const s = await store();
  const tiles = s.compositions
    .filter((c) => c.imagePaths.length > 0 && s.getAccount(c.accountId)?.brand===brand)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 60)
    .map((c) => ({
      id: c.id,
      url: `/renders/${basename(c.imagePaths[0]!)}`,
      layout: c.layout,
      skin: c.skin,
      accents: c.accents,
      archetype: c.archetype,
    }));
  return <><p><a href="?brand=f1">F1</a> · <a href="?brand=vct">VCT</a> · <a href="?brand=film">Film & TV</a></p><Sheet tiles={tiles} /><CarouselBuilder claims={s.claims.filter(c=>c.vertical===brand).slice(-100).map(c=>({id:c.id,label:`${c.vertical} · ${c.headline ?? c.claimType}`}))}/></>;
}
