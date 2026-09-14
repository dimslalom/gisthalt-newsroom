import { basename } from 'node:path';
import { RENDERER_URL } from '../../../lib/renderer.ts';
import { store } from '../../../lib/store.ts';

export const dynamic = 'force-dynamic';

/**
 * Download a post's current image for posting by hand: `format=feed` is the
 * 4:5 render as-is (X, Instagram, Threads), `format=vertical` is TikTok's
 * 9:16 frame — the same one the publisher would upload.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('compositionId');
  const vertical = params.get('format') === 'vertical';
  if (!id) return new Response('compositionId is required', { status: 400 });
  const s = await store();
  const comp = s.getComposition(id);
  const image = comp?.imagePaths[0];
  if (!comp || !image) return new Response('post has no rendered image yet', { status: 404 });

  const renderPath = `/renders/${basename(image)}`;
  const upstream = vertical
    ? `${RENDERER_URL}/export?path=${encodeURIComponent(renderPath)}`
    : `${RENDERER_URL}${renderPath}`;
  const res = await fetch(upstream, { cache: 'no-store' });
  if (!res.ok) return new Response('render not found', { status: 404 });

  const name = `${comp.archetype}-${comp.layout}-${comp.id.slice(0, 8)}-${vertical ? '9x16' : 'saved'}.png`;
  return new Response(await res.arrayBuffer(), {
    headers: {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
