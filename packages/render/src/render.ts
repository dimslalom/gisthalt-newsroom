import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import {
  CANVAS, CANVASES, renderArtHtml, renderDocHtml, getLayoutDoc, sanitizeDoc, pickLogoCorner, pickTextTreatment,
  resolveColours, scanContrast,
  type CanvasKey, type CompositionSpec, type ContrastFinding, type LayoutDoc,
} from '@newsroom/design';
import { fontsCss, fontsPinned } from './fonts.ts';
import { getPool } from './pool.ts';

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
};

export interface RenderOptions {
  outDir?: string;
  /** Local path or http(s) URL. Remote images are fetched once and inlined. */
  imagePath?: string | null;
  fileName?: string;
  /** Output size. Only meaningful for layouts backed by a document — the
   *  built-in CSS layouts are authored against 4:5 and are not resizable. */
  canvas?: CanvasKey;
  /** Render this document instead of whatever is saved, so the editor can
   *  preview an unsaved edit without writing to the brand's layouts.json. */
  docOverride?: unknown;
  /** Hard-fail on a failing contrast finding instead of only reporting it.
   *  Only scripts/render-goldens.ts sets this — a live preview always warns. */
  certify?: boolean;
}

export interface ElementRect {
  /** The template path reports stable element names ('headline'); the document
   *  path reports node ids, which is what the layers panel selects by. */
  name: string;
  kind?: string;
  x: number; y: number; width: number; height: number;
}

export interface RenderResult {
  path: string;
  bytes: number;
  width: number;
  height: number;
  ms: number;
  /** What the guards decided, surfaced so the lab can show its working. */
  guards: {
    logo: string;
    treatment: { scrim: number; colour: string; overImage: boolean } | null;
    headlineOverflowed: boolean;
    fittedPx: string | null;
    fontsPinned: boolean;
  };
  /** Every `[data-el]` node's real rendered box, in canvas pixels relative to
   *  the `.art` element's own top-left — what the visual editor draws its
   *  bounding-box handles on top of. Only elements this claim/layout actually
   *  rendered appear here; nothing is a guess. */
  elements: ElementRect[];
  /** Live, warn-only contrast findings for a document-backed layout — empty
   *  for the built-in CSS layouts, which stay covered by assertContrast()'s
   *  fixed pair list alone. Certification (scripts/render-goldens.ts) is what
   *  turns a failing finding here into a hard error, via renderDocHtml's
   *  `certify` option; a live preview only ever warns. */
  contrast: ContrastFinding[];
}

/** Local file or remote URL to a data: URI, so the page loads nothing at render time. */
export async function inlineImage(pathOrUrl: string): Promise<string | null> {
  try {
    if (/^https?:\/\//.test(pathOrUrl)) {
      const res = await fetch(pathOrUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      if (Number(res.headers.get('content-length')) > 20_000_000) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 20_000_000) return null;
      const type = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
      return `data:${type};base64,${buf.toString('base64')}`;
    }
    if (!existsSync(pathOrUrl)) return null;
    const buf = readFileSync(pathOrUrl);
    return `data:${MIME[extname(pathOrUrl).toLowerCase()] ?? 'image/png'};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * The one render path. The dashboard previews by calling this, never by
 * displaying template HTML locally: Windows and Linux rasterise type
 * differently and a preview that lies is worse than no preview.
 */
export async function renderComposition(spec: CompositionSpec, opts: RenderOptions = {}): Promise<RenderResult> {
  const started = Date.now();
  const outDir = resolve(opts.outDir ?? process.env.RENDER_OUT_DIR ?? './.data/renders');
  mkdirSync(outDir, { recursive: true });

  // A document, if this brand/archetype/layout has one. No document means the
  // built-in CSS template, byte-identical to before this existed.
  const doc = opts.docOverride
    ? (sanitizeDoc(opts.docOverride) ?? null)
    : getLayoutDoc(spec.brand.key, spec.archetype.key, spec.layout);
  const canvasKey: CanvasKey = opts.canvas ?? doc?.canvas ?? 'portrait-4x5';
  const size = doc ? CANVASES[canvasKey] : { width: CANVAS.width, height: CANVAS.height };

  const rawImage = opts.imagePath ?? spec.model.imageUrl ?? null;
  let imageSrc = rawImage ? await inlineImage(rawImage) : null;
  let normalizedImage: string | null = null;
  if (imageSrc) {
    try {
      const bytes = Buffer.from(imageSrc.split(',')[1]!, 'base64');
      const meta = await sharp(bytes).metadata();
      if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) imageSrc = null;
      else {
        const cropped = await sharp(bytes).rotate().resize(size.width, size.height, { fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
        normalizedImage = join(outDir, `.image-${createHash('sha256').update(cropped).digest('hex').slice(0,16)}.png`);
        writeFileSync(normalizedImage, cropped);
        imageSrc = `data:image/png;base64,${cropped.toString('base64')}`;
      }
    } catch { imageSrc = null; }
  }

  // Guards run before the HTML is built, on the real image bytes.
  let treatment: RenderResult['guards']['treatment'] = null;
  let logo: CompositionSpec['logoPlacement'] = 'tr';
  if (normalizedImage && imageSrc) {
    const t = await pickTextTreatment(normalizedImage, { left: 0, top: 0, width: 400, height: 200 });
    treatment = { scrim: t.scrim, colour: t.colour, overImage: t.overImage };
    logo = await pickLogoCorner(normalizedImage);
  }

  const resolved: CompositionSpec = {
    ...spec,
    logoPlacement: logo,
    textTreatment: treatment ?? undefined,
    // pickTextTreatment said no scrim can rescue this region: move off the image.
    skin: spec.skin,
  };

  const fonts = fontsCss(JSON.stringify(spec.model), spec.brand.key);
  const html = doc
    ? renderDocHtml(doc, resolved, { fontsCss: fonts, imageSrc, canvas: canvasKey, certify: opts.certify })
    : renderArtHtml(resolved, { fontsCss: fonts, imageSrc });
  // Live, warn-only — the same scan certification later runs with `certify:
  // true` inside renderDocHtml, but a preview render must never throw on it.
  const contrast: ContrastFinding[] = doc ? scanContrast(doc, resolved, resolveColours(resolved).vars) : [];

  const pool = getPool();
  const page = await pool.acquire();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (document as unknown as { fonts: FontFaceSet }).fonts.ready);
    await page.waitForFunction(() => (window as unknown as { __fitDone?: boolean }).__fitDone === true, null, { timeout: 5000 })
      ;
    // `.headline` is the template path's class; a document names its own nodes,
    // so ask for whatever actually ran through fitText instead.
    const fit = await page.evaluate(() => {
      const el = (document.querySelector('.headline') ?? document.querySelector('[data-fitted]')) as HTMLElement | null;
      return { overflow: el?.dataset.overflow === '1', px: el?.dataset.fitted ?? null };
    });
    // One pass, so every rect is measured against the same layout snapshot —
    // the editor's overlay boxes are only ever as good as this geometry.
    const elements: ElementRect[] = await page.evaluate(() => {
      const art = document.querySelector('.art')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('[data-el]')).map((node) => {
        const r = node.getBoundingClientRect();
        return {
          name: node.getAttribute('data-el')!,
          kind: node.getAttribute('data-kind') ?? undefined,
          x: Math.round(r.left - art.left), y: Math.round(r.top - art.top),
          width: Math.round(r.width), height: Math.round(r.height),
        };
      });
    });

    const name = opts.fileName ?? `${hashSpec(resolved, doc)}.png`;
    const file = join(outDir, name);
    const el = await page.$('.art');
    const buf = await el!.screenshot({ type: 'png' });
    writeFileSync(file, buf);

    return {
      path: file,
      bytes: buf.length,
      width: size.width,
      height: size.height,
      ms: Date.now() - started,
      guards: { logo: String(logo), treatment, headlineOverflowed: fit.overflow, fittedPx: fit.px, fontsPinned: fontsPinned() },
      elements,
      contrast,
    };
  } finally {
    await pool.release(page);
  }
}

export function hashSpec(spec: CompositionSpec, doc?: LayoutDoc | null): string {
  return createHash('sha1').update(JSON.stringify({
    brand: spec.brand.key, archetype: spec.archetype.key, layout: spec.layout,
    skin: spec.skin.key, accents: spec.accents, model: spec.model,
    // The doc drives everything the editor lets you drag or recolor; leaving
    // it out of the hash meant every unsaved edit reused the same filename,
    // so the preview <img>'s src never changed and the browser never refetched.
    doc,
  })).digest('hex').slice(0, 16);
}
