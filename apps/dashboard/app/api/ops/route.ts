import { NextResponse } from 'next/server';
import { withCtx, updateOps } from '@newsroom/pipeline';
export async function POST(req: Request) {
  try { const body = await req.json(); return NextResponse.json(await withCtx((ctx) => updateOps(ctx, body))); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
