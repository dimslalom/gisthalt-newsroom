import { NextResponse } from 'next/server';
import { withCtx, createCarousel } from '@newsroom/pipeline';
export const maxDuration = 300;
export async function POST(req: Request) {
  try { const body = await req.json(); return NextResponse.json(await withCtx((ctx)=>createCarousel(ctx,body.claimIds))); }
  catch(e) { return NextResponse.json({error:(e as Error).message},{status:400}); }
}
