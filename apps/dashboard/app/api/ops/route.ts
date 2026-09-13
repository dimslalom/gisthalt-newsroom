import { NextResponse } from 'next/server';
import { withCtx, updateOps, assessReadiness } from '@newsroom/pipeline';
import { getCatalog } from '../../../lib/renderer.ts';

export async function GET() {
  const rendererUp = Boolean(await getCatalog());
  const report = await withCtx((ctx) => assessReadiness(ctx.store, { rendererUp, dryRun: process.env.PUBLISH_DRY_RUN !== 'false' }));
  return NextResponse.json(report, { status: report.level === 'fail' ? 503 : 200 });
}

export async function POST(req: Request) {
  try { const body = await req.json(); return NextResponse.json(await withCtx((ctx) => updateOps(ctx, body))); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
