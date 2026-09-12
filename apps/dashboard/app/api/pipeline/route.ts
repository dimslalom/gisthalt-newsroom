import { NextResponse } from 'next/server';
import { withCtx, tick } from '@newsroom/pipeline';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const { render } = await req.json();
    return NextResponse.json(await withCtx((ctx) => tick(ctx, { render })));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
