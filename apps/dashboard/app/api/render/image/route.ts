import { RENDERER_URL } from '../../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path');
  if (!path?.startsWith('/renders/')) return new Response('bad path', { status: 400 });
  const res = await fetch(`${RENDERER_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) return new Response('not found', { status: 404 });
  return new Response(await res.arrayBuffer(), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
}
