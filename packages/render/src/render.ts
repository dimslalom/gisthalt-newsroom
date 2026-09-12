import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { CANVAS, renderArtHtml, pickLogoCorner, pickTextTreatment, type CompositionSpec } from '@newsroom/design';
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

  const rawImage = opts.imagePath ?? spec.model.imageUrl ?? null;
  let imageSrc = rawImage ? await inlineImage(rawImage) : null;
  let normalizedImage: string | null = null;
  if (imageSrc) {
    try {
      const bytes = Buffer.from(imageSrc.split(',')[1]!, 'base64');
      const meta = await sharp(bytes).metadata();
      if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) imageSrc = null;
      else {
        const cropped = await sharp(bytes).rotate().resize(1080, 1350, { fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
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

  const html = renderArtHtml(resolved, { fontsCss: fontsCss(JSON.stringify(spec.model)), imageSrc });

  const pool = getPool();
  const page = await pool.acquire();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (document as unknown as { fonts: FontFaceSet }).fonts.ready);
    await page.waitForFunction(() => (window as unknown as { __fitDone?: boolean }).__fitDone === true, null, { timeout: 5000 })
      ;
    const fit = await page.evaluate(() => {
      const el = document.querySelector('.headline') as HTMLElement | null;
      return { overflow: el?.dataset.overflow === '1', px: el?.dataset.fitted ?? null };
    });

    const name = opts.fileName ?? `${hashSpec(resolved)}.png`;
    const file = join(outDir, name);
    const el = await page.$('.art');
    const buf = await el!.screenshot({ type: 'png' });
    writeFileSync(file, buf);

    return {
      path: file,
      bytes: buf.length,
      width: CANVAS.width,
      height: CANVAS.height,
      ms: Date.now() - started,
      guards: { logo: String(logo), treatment, headlineOverflowed: fit.overflow, fittedPx: fit.px, fontsPinned: fontsPinned() },
    };
  } finally {
    await pool.release(page);
  }
}

export function hashSpec(spec: CompositionSpec): string {
  return createHash('sha1').update(JSON.stringify({
    brand: spec.brand.key, archetype: spec.archetype.key, layout: spec.layout,
    skin: spec.skin.key, accents: spec.accents, model: spec.model,
  })).digest('hex').slice(0, 16);
}
