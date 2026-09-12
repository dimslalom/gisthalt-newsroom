import { NextResponse } from 'next/server';
import { withCtx, approve, reject, holdForSecondSource, reshuffle, editCaption, retract } from '@newsroom/pipeline';
import type { Platform } from '@newsroom/core';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await withCtx(async (ctx) => {
      switch (body.action) {
        case 'approve': return approve(ctx, body.reviewId);
        case 'reject': return reject(ctx, body.reviewId);
        case 'hold': return holdForSecondSource(ctx, body.reviewId);
        case 'reshuffle': return reshuffle(ctx, body.reviewId);
        case 'caption': return editCaption(ctx, body.compositionId, body.platform as Platform, body.caption ?? '');
        case 'retract': return retract(ctx, body.postId);
        default: throw new Error('unknown review action');
      }
    });
    return NextResponse.json(data);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
