import { NextResponse } from 'next/server';
import { getCatalog, rendererFetch, rendererImage } from '../../../lib/renderer.ts';
import { store } from '../../../lib/store.ts';

export const dynamic = 'force-dynamic';

interface ReferenceOut {
  imageSrc: string; width: number; height: number; archetype: string; layout: string;
  real: boolean; headline: string | null; caption: string | null;
}

/**
 * The reference render, scoped to one exact archetype/layout pair — the one
 * currently open in the studio, never a different one from elsewhere in the
 * brand. A random real post from that same pair, re-rendered fresh through
 * the current design; falls back to a sample fixture only when this brand
 * has no usable real post for this specific archetype/layout yet.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand') ?? 'f1';
  const archetype = searchParams.get('archetype');
  const layout = searchParams.get('layout');
  if (!archetype || !layout) return NextResponse.json({ error: 'archetype and layout are required' }, { status: 400 });

  const s = await store();
  const candidates = s.compositions.filter((c) => {
    if (!c.renderedAt || c.archetype !== archetype || c.layout !== layout) return false;
    const claim = s.getClaim(c.claimId);
    if (!claim || claim.vertical !== brand || !claim.headline?.trim() || !claim.imageUrl) return false;
    return Object.values(c.captionByPlatform ?? {}).some((cap) => cap?.trim());
  });

  if (candidates.length) {
    const comp = candidates[Math.floor(Math.random() * candidates.length)]!;
    const claim = s.getClaim(comp.claimId)!;
    const caption = Object.values(comp.captionByPlatform ?? {}).find((cap) => cap?.trim()) ?? null;
    try {
      const out = await rendererFetch<{ url: string; width: number; height: number }>('/render', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, archetype, layout, claim }),
      });
      const body: ReferenceOut = {
        imageSrc: rendererImage(out.url), width: out.width, height: out.height,
        archetype, layout, headline: claim.headline!, caption, real: true,
      };
      return NextResponse.json(body);
    } catch { /* fall through to the fixture path below */ }
  }

  // No real post for this exact pair yet — a sample fixture, still a real photo.
  const catalog = await getCatalog(brand);
  const fixture = catalog?.fixtures.find((f) => f.includes('basic')) ?? catalog?.fixtures[0];
  if (!fixture) return NextResponse.json({ error: 'no fixture available' }, { status: 404 });
  try {
    const out = await rendererFetch<{ url: string; width: number; height: number }>('/render', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, archetype, layout, fixture, skin: catalog?.skins[0] }),
    });
    const body: ReferenceOut = {
      imageSrc: rendererImage(out.url), width: out.width, height: out.height,
      archetype, layout, headline: null, caption: null, real: false,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
