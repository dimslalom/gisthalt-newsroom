import { NextResponse } from 'next/server';
import { regenerateRecentF1Reviews, withCtx } from '@newsroom/pipeline';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST() {
  try { return NextResponse.json(await withCtx((ctx) => regenerateRecentF1Reviews(ctx))); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
