import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/** Starts a full certification run in the renderer container — the same
 *  `render-goldens.ts --update` a terminal would run, just triggered here. */
export async function POST() {
  try {
    const res = await fetch(`${RENDERER_URL}/goldens/run`, { method: 'POST', cache: 'no-store' });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
