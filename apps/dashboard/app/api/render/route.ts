import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/** Proxy so the browser talks to one origin and the renderer stays in its container. */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${RENDERER_URL}/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
