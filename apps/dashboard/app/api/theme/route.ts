import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/** Same proxy shape as /api/layout-override: the renderer is the one process
 *  that resolves the brand's saved theme at render time, so it's the one
 *  process that owns reading, saving and clearing it too. */
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  try {
    const res = await fetch(`${RENDERER_URL}/theme${search}`, { cache: 'no-store' });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { search } = new URL(req.url);
  const body = await req.text();
  const clear = search.includes('clear=1');
  try {
    const res = await fetch(`${RENDERER_URL}/theme${clear ? '/clear' : ''}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
