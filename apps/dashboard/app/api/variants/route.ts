import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${RENDERER_URL}/variants`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
