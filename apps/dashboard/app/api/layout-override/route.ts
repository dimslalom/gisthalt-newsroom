import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/**
 * The dashboard never touches brand config files directly — it proxies to the
 * renderer, the one process that actually resolves an override at render
 * time, so save/read/clear can never drift from what a render will see.
 */
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  try {
    const res = await fetch(`${RENDERER_URL}/layout-override${search}`, { cache: 'no-store' });
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
    const res = await fetch(`${RENDERER_URL}/layout-override${clear ? '/clear' : ''}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
