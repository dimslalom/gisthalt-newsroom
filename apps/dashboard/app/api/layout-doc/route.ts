import { NextResponse } from 'next/server';
import { RENDERER_URL } from '../../../lib/renderer.ts';

export const dynamic = 'force-dynamic';

/**
 * Same rule as layout-override: the dashboard never writes brand config
 * itself. The renderer is the one process that resolves a document at render
 * time, so it is the one process that saves them — the editor cannot end up
 * showing a design the renderer wouldn't actually draw.
 *
 * `?op=seed` forks the built-in CSS layout into an editable document;
 * `?op=delete` drops back to it.
 */
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  try {
    const res = await fetch(`${RENDERER_URL}/layout-doc${search}`, { cache: 'no-store' });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const op = new URL(req.url).searchParams.get('op');
  const suffix = op === 'seed' ? '/seed' : op === 'delete' ? '/delete' : '';
  const body = await req.text();
  try {
    const res = await fetch(`${RENDERER_URL}/layout-doc${suffix}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store',
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: `renderer unreachable at ${RENDERER_URL}: ${(e as Error).message}` }, { status: 502 });
  }
}
