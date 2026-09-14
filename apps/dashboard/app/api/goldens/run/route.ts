import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/** Starts a certification run in the renderer container — the same
 *  `render-goldens.ts --update` a terminal would run, just triggered here.
 *  An optional `{layout: "<brand>/<archetype>/<layout>"}` body scopes it to
 *  one row from the worklist instead of the full matrix. */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${RENDERER_URL}/goldens/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: body || '{}', cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
