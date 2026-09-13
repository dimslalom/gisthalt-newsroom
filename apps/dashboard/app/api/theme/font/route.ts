import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/** Fetching a Google Font can take a few seconds (css2 + woff2 downloads for
 *  every weight) and can genuinely fail (typo'd family name, Google Fonts
 *  unreachable) — kept as its own route so that failure never looks like a
 *  generic theme-save error in the UI. */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${RENDERER_URL}/theme/font`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
