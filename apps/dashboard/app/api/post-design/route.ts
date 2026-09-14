import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import { brandForVertical } from '@newsroom/brands';
import { claimOf, editablePostDoc, editPostCaption, postAccents, postSkin, savePostDesign, withCtx } from '@newsroom/pipeline';
import type { Platform } from '@newsroom/core';
import { rendererFetch } from '../../../lib/renderer.ts';
import { store } from '../../../lib/store.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface LayoutDocMeta { doc: unknown; fields: unknown[]; canvases: unknown[] }

/**
 * One post, opened for design: its real claim (headline, photo, fields), its
 * captions, and the document to edit — the post's own if it's been
 * hand-edited, otherwise its layout's document, otherwise that layout's seed.
 * Loading never writes anything; only POST saves.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('compositionId');
  if (!id) return NextResponse.json({ error: 'compositionId is required' }, { status: 400 });
  try {
    const s = await store();
    const comp = s.getComposition(id);
    if (!comp) return NextResponse.json({ error: 'unknown post' }, { status: 404 });
    const row = s.getClaim(comp.claimId);
    if (!row) return NextResponse.json({ error: 'post has no claim' }, { status: 404 });
    const brand = brandForVertical(row.vertical);
    const q = `brand=${brand.key}&archetype=${encodeURIComponent(comp.archetype)}&layout=${encodeURIComponent(comp.layout)}`;
    const meta = await rendererFetch<LayoutDocMeta>(`/layout-doc?${q}`);
    // No saved layout document either: the derive route with no transforms
    // hands back that layout's seed without saving it to brand config.
    const doc = comp.doc ?? meta.doc ?? (await rendererFetch<{ doc: unknown }>('/layout-doc/derive', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand: brand.key, archetype: comp.archetype, fromLayout: comp.layout, transforms: [] }),
    })).doc;
    const editable = editablePostDoc(doc, postAccents(comp.accents), brand.tokens.unit);
    return NextResponse.json({
      compositionId: comp.id, brand: brand.key, archetype: comp.archetype, layout: comp.layout,
      skin: postSkin(brand, comp.skin) ?? null,
      accents: editable.accents,
      claim: claimOf(row), imagePath: row.imageUrl,
      headline: row.headline ?? row.claimType,
      captions: comp.captionByPlatform,
      customised: Boolean(comp.doc),
      carousel: comp.imagePaths.length > 1,
      imageUrl: comp.imagePaths[0] ? `/renders/${basename(comp.imagePaths[0])}` : null,
      doc: editable.doc, fields: meta.fields, canvases: meta.canvases,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** Save a post's design (re-renders its image), or `?op=reset` to drop back
 *  to the layout's own document. */
export async function POST(req: Request) {
  const reset = new URL(req.url).searchParams.get('op') === 'reset';
  try {
    const body = await req.json() as { compositionId?: string; doc?: unknown };
    if (!body.compositionId) return NextResponse.json({ error: 'compositionId is required' }, { status: 400 });
    if (!reset && body.doc == null) return NextResponse.json({ error: 'doc is required; use op=reset to reset' }, { status: 400 });
    const comp = await savePostDesign(body.compositionId, reset ? null : body.doc);
    return NextResponse.json({
      imageUrl: comp.imagePaths[0] ? `/renders/${basename(comp.imagePaths[0])}` : null,
      customised: Boolean(comp.doc),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { compositionId?: string; platform?: string; caption?: string };
    if (!body.compositionId || !['x', 'instagram', 'threads', 'tiktok'].includes(body.platform ?? '') || typeof body.caption !== 'string') {
      return NextResponse.json({ error: 'compositionId, valid platform and caption are required' }, { status: 400 });
    }
    const comp = await withCtx((ctx) => editPostCaption(ctx, body.compositionId!, body.platform as Platform, body.caption!));
    return NextResponse.json({ captions: comp.captionByPlatform });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
