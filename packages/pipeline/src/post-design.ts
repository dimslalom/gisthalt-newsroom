import { brandForVertical } from '@newsroom/brands';
import { CANVASES, sanitizeDoc, type Brand } from '@newsroom/design';
import { readStore, type CompositionRow } from '@newsroom/db';
import { renderRemote, type RenderRequest } from '@newsroom/render';
import { contextFor, withCtx, type Ctx } from './context.ts';
import { claimOf } from './stages/gate.ts';
import { validateCaption, type Platform } from '@newsroom/core';

/** Manual editing never approves a review or queues a publication. */
export function assertPostEditable(ctx: Ctx, compositionId: string): void {
  if (ctx.store.posts.some((p) => p.compositionId === compositionId &&
    ['publishing', 'uncertain', 'published', 'retraction_requested'].includes(p.status))) {
    throw new Error('This post has a live or unresolved publication. Create a new composition before editing.');
  }
}

export function editPostCaption(ctx: Ctx, compositionId: string, platform: Platform, caption: string): CompositionRow {
  const comp = ctx.store.getComposition(compositionId);
  if (!comp) throw new Error('unknown composition');
  assertPostEditable(ctx, compositionId);
  validateCaption(caption, platform);
  return ctx.store.updateComposition(comp.id, { captionByPlatform: { ...comp.captionByPlatform, [platform]: caption } })!;
}

/**
 * A composition's stored skin key, if this brand still has that skin. Some
 * compositions predate the brand's skin set being rebuilt (five skins down to
 * one), and the renderer rejects an unknown skin outright.
 */
export function postSkin(brand: Brand, skin: string): string | undefined {
  return brand.skins.some((s) => s.key === skin) ? skin : undefined;
}

/** A post's accents as re-rendered today. The background-word watermark is no
 *  longer part of the brand's look, so it's dropped even from compositions
 *  made before it was retired — the editor preview and the saved render
 *  both go through this, so they can never disagree. */
export function postAccents(accents: string[]): string[] {
  return accents.filter((a) => a !== 'watermark');
}

/** Convert the legacy ticker overlay into ordinary editable post layers.
 * The document id marker survives deleting the bar, so deletion stays deleted.
 * Original composition accents remain intact for Reset to shared layout. */
export function editablePostDoc(raw: unknown, accents: string[], unit: number) {
  const doc = sanitizeDoc(raw);
  if (!doc) throw new Error('document rejected: root must be a frame');
  if (accents.includes('ticker') && !doc.id.endsWith('--editable-ticker')) {
    const id = `${doc.id}-lower-bar`;
    const height = 46 / CANVASES[doc.canvas].height;
    doc.id += '--editable-ticker';
    doc.root.padding = { ...doc.root.padding, bottom: (doc.root.padding?.bottom ?? 8) + 46 / unit };
    doc.root.children.push({
      kind: 'frame', id, name: 'Lower bar', axis: 'horizontal', align: 'center', gap: 36 / unit,
      position: { mode: 'absolute', top: 1 - height, left: 0, width: 1, height },
      padding: { left: 24 / unit, right: 24 / unit },
      background: { type: 'solid', colour: { ref: 'accent' } },
      children: ([['Session', 'eyebrow'], ['Source', 'footnote'], ['Brand', 'brand.name']] as const).map(([name, field], i) => ({
        kind: 'text' as const, id: `${id}-${i}`, name: `Bar · ${name}`,
        source: { type: 'field' as const, field }, font: { token: 'mono' as const }, step: { px: 16 },
        colour: { ref: 'on-accent' }, transform: 'uppercase' as const, letterSpacing: '.22em', maxLines: 1,
      })),
    });
  }
  return { doc, accents: accents.filter((a) => a !== 'ticker') };
}

/** Validates one post re-render against a store and builds the renderer
 *  request. Reads only — safe against a lock-free snapshot. */
function planPostRender(ctx: Ctx, compositionId: string, doc: unknown): { doc: ReturnType<typeof sanitizeDoc>; request: RenderRequest } {
  const comp = ctx.store.getComposition(compositionId);
  if (!comp) throw new Error('unknown composition');
  assertPostEditable(ctx, compositionId);
  if (comp.imagePaths.length > 1) throw new Error('carousel posts cannot be edited one slide at a time yet');
  const row = ctx.store.getClaim(comp.claimId);
  if (!row) throw new Error('composition has no claim');
  if (doc != null && (typeof doc !== 'object' || (doc as { root?: { kind?: string } }).root?.kind !== 'frame')) {
    throw new Error('document rejected: root must be a frame');
  }
  const brand = brandForVertical(row.vertical);
  const accents = postAccents(comp.accents);
  // Stored exactly as the renderer will read it, never the raw request body.
  const editable = doc == null ? null : editablePostDoc(doc, accents, brand.tokens.unit);
  const clean = editable?.doc ?? null;
  return {
    doc: clean,
    request: {
      brand: brand.key, claim: claimOf(row), archetype: comp.archetype, layout: comp.layout,
      skin: postSkin(brand, comp.skin), accents: editable?.accents ?? accents, imagePath: row.imageUrl,
      doc: clean ?? undefined,
      // A fresh file per save, so no open preview is ever served the old render.
      fileName: `${comp.id}-${Date.now()}.png`,
    },
  };
}

function commitPostRender(ctx: Ctx, compositionId: string, doc: ReturnType<typeof sanitizeDoc>, path: string): CompositionRow {
  // Re-checked under the write lock: the post may have gone live while rendering.
  assertPostEditable(ctx, compositionId);
  const comp = ctx.store.updateComposition(compositionId, { doc, imagePaths: [path], renderedAt: ctx.now() });
  if (!comp) throw new Error('unknown composition');
  return comp;
}

/**
 * Re-renders one post from a hand-edited design, inside the caller's store.
 * The document is stored on the composition itself, so editing a post never
 * touches the brand's shared layouts, and the render becomes the post's image
 * — the same file review approval and the publishers already read. A
 * hand-edited post is not golden-certified: the owner looking at it is the
 * check, with the editor's live contrast and overflow warnings as guardrails.
 * `doc: null` drops back to the layout's own document.
 */
export async function renderPostDesign(ctx: Ctx, compositionId: string, doc: unknown): Promise<CompositionRow> {
  const plan = planPostRender(ctx, compositionId, doc);
  const out = await renderRemote(plan.request);
  return commitPostRender(ctx, compositionId, plan.doc, out.path);
}

/**
 * The dashboard's save. Plans against a lock-free read snapshot and renders
 * before taking the global write lock, which is then held only for the final
 * row write. Worker polls hold that same lock across network calls for a
 * minute or more, so rendering inside it made Save queue behind them — and
 * made every worker queue behind Save. The wait for the lock itself remains.
 */
export async function savePostDesign(compositionId: string, doc: unknown): Promise<CompositionRow> {
  const plan = planPostRender(contextFor(await readStore()), compositionId, doc);
  const out = await renderRemote(plan.request);
  return withCtx((ctx) => commitPostRender(ctx, compositionId, plan.doc, out.path));
}
