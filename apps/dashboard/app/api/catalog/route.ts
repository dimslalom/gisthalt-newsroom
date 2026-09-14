import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/** A client-fetchable version of lib/renderer.ts's getCatalog() — needed so
 *  the worklist can refetch archetypes/layouts when its brand tab changes,
 *  instead of only ever seeing the brand the page first loaded with. */
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  try {
    const res = await fetch(`${RENDERER_URL}/catalog${search}`, { cache: 'no-store' });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
