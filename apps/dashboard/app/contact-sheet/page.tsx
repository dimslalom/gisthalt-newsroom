import { CarouselBuilder } from './carousel-builder.tsx';
import { basename } from 'node:path';
import { store } from '../../lib/store.ts';
import { Sheet } from './sheet.tsx';
import { workspaceBrands, workspaceBrand } from '@newsroom/brands';

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
  return <><nav className="brand-tabs" aria-label="Brand">{workspaceBrands(s).map(({key, name}) => <a key={key} href={`?brand=${key}`} aria-current={brand === key ? 'page' : undefined}>{name}</a>)}</nav><Sheet tiles={tiles} /><CarouselBuilder claims={s.claims.filter(c=>c.vertical===workspaceBrand(s,brand).vertical).slice(-100).map(c=>({id:c.id,headline:c.headline ?? c.claimType}))}/></>;
}
