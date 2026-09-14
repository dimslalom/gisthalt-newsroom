import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${RENDERER_URL}/layout-doc/derive`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
