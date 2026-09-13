import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  clearLayoutOverride, compose, composeCarousel, enumerateVariants, getLayoutOverride, saveLayoutOverride,
  getLayoutDoc, saveLayoutDoc, deleteLayoutDoc, seedDoc, presentFields, FIELDS, CANVASES, CANVAS_KEYS,
  loadThemeOverride, saveThemeOverride, clearThemeOverride, FONT_SLOTS,
  type Brand, type CanvasKey, type CompositionSpec, type LayoutKey, type LayoutOverride,
  type SkinColourRole, type FontSlot, type ThemeOverride, type LetterSpacingSlot,
} from '@newsroom/design';
import type { Claim } from '@newsroom/core';
import { brandByKey, brands } from '@newsroom/brands';
import { loadFixture, fixtureNames } from './fixtures.ts';
import { renderComposition } from './render.ts';
import { fetchGoogleFont } from './google-fonts.ts';
import { pinUploadedFont } from './custom-font.ts';
import { invalidateBrandFontsCache } from './fonts.ts';

const OUT = resolve(process.env.RENDER_OUT_DIR ?? './.data/renders');

/**
 * Certification, run from the GUI instead of a terminal. `render-goldens.ts`
 * is a standalone CLI script (top-level await, process.exit on completion) —
 * rather than refactor its internals to be importable, this spawns it exactly
 * as the CLI does and parses its own progress lines, since those lines are
 * already the single source of truth a human reads when running it by hand.
 * One job at a time, in memory: this is a local admin action for whoever has
 * the dashboard open, not a queued multi-tenant operation.
 */
interface GoldenJob { running: boolean; checked: number; total: number; done: boolean; passed?: number; error?: string; startedAt?: number; finishedAt?: number }
let goldenJob: GoldenJob = { running: false, checked: 0, total: 0, done: false };

function startGoldenRun(): void {
  goldenJob = { running: true, checked: 0, total: 0, done: false, startedAt: Date.now() };
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/render-goldens.ts', '--update'], {
    cwd: process.cwd(), env: process.env,
  });
  let outBuf = '', errBuf = '';
  child.stdout.on('data', (chunk: Buffer) => {
    outBuf += chunk.toString();
    const lines = outBuf.split('\n'); outBuf = lines.pop() ?? '';
    for (const line of lines) {
      const progress = line.match(/(\d+)\/(\d+) renders checked/);
      if (progress) { goldenJob.checked = Number(progress[1]); goldenJob.total = Number(progress[2]); }
      const finished = line.match(/(\d+)\/(\d+) passed/);
      if (finished) { goldenJob.passed = Number(finished[1]); goldenJob.total = Number(finished[2]); }
    }
  });
  child.stderr.on('data', (chunk: Buffer) => { errBuf += chunk.toString(); });
  child.on('error', (e) => { goldenJob = { ...goldenJob, running: false, done: true, error: e.message, finishedAt: Date.now() }; });
  child.on('exit', (code) => {
    goldenJob = {
      ...goldenJob, running: false, done: true, finishedAt: Date.now(),
      error: code !== 0 ? (errBuf.trim().slice(-4000) || `certification exited with code ${code}`) : undefined,
    };
  });
}

interface RenderBody {
  brand?: string;
  fixture?: string;
  claim?: Claim;
  archetype?: string;
  layout?: LayoutKey;
  skin?: string;
  accents?: string[];
  imagePath?: string | null;
  reshuffle?: number;
  fileName?: string;
  canvas?: CanvasKey;
  /** An unsaved document from the editor, previewed without persisting. */
  doc?: unknown;
}

function specFor(body: RenderBody): { spec: CompositionSpec; imagePath: string | null } {
  const brand: Brand = brandByKey(body.brand ?? 'f1');
  const fixture = body.fixture ? loadFixture(body.fixture) : null;
  const raw = body.claim ?? fixture?.claim;
  let claim: Claim = raw ? { ...raw, observedAt: new Date(raw.observedAt) } : raw!;
  if (!claim) throw new Error('render needs either a claim or a fixture');
  const requested = body.archetype ? brand.archetypes.find(a=>a.key===body.archetype) : undefined;
  if (body.archetype && !requested) throw new Error('unknown archetype');
  if (fixture && requested) claim = {...claim, vertical:brand.vertical, claimType:requested.claimTypes[0]!};
  if (body.layout && requested && !requested.layouts.includes(body.layout)) throw new Error('layout is not supported by archetype');
  if (body.skin && !brand.skins.some(s=>s.key===body.skin)) throw new Error('unknown skin');
  if (body.accents && (body.accents.length > 2 || new Set(body.accents).size !== body.accents.length || body.accents.some(a=>!['diagonal','halftone','grain','ticker','watermark','cropmarks'].includes(a)))) throw new Error('invalid accents');
  const imagePath = body.imagePath ?? fixture?.imagePath ?? null;

  const base = compose({ brand, claim, history: [], hasImage: Boolean(imagePath), allowUncertified: true, reshuffle: body.reshuffle });
  const archetype = body.archetype
    ? brand.archetypes.find((a) => a.key === body.archetype) ?? base.archetype
    : base.archetype;

  return {
    spec: {
      ...base,
      archetype,
      model: archetype.model(claim),
      layout: body.layout ?? archetype.layouts[0]!,
      // This brand's own skin set, never the shared global list — see the same
      // fix in composer.ts for why that substitution is a real bug, not style.
      skin: body.skin ? brand.skins.find((s) => s.key === body.skin) ?? base.skin : base.skin,
      accents: (body.accents as CompositionSpec['accents']) ?? base.accents,
    },
    imagePath,
  };
}

const json = (res: import('node:http').ServerResponse, code: number, body: unknown): void => {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), 'access-control-allow-origin': '*' });
  res.end(text);
};

/**
 * The renderer is a service, not a library call from the dashboard. Previews
 * must go through the same container that produces production PNGs.
 */
export function startRenderServer(port = Number(process.env.RENDER_PORT ?? 8787)) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, {error:'cross-origin mutation denied'});

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' });
        return res.end();
      }

      if (url.pathname === '/health') {
        return json(res, 200, { ok: true, out: OUT });
      }

      if (url.pathname === '/catalog') {
        const brand = brandByKey(url.searchParams.get('brand') ?? 'f1');
        return json(res, 200, {
          brands: brands.map((b) => ({ key: b.key, name: b.name })),
          fixtures: fixtureNames(),
          skins: brand.skins.map((s) => s.key),
          archetypes: brand.archetypes.map((a) => ({ key: a.key, layouts: a.layouts, claimTypes: a.claimTypes })),
        });
      }

      if (url.pathname.startsWith('/renders/')) {
        const file = join(OUT, basename(url.pathname));
        if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
        const buf = readFileSync(file);
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': buf.length, 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
        return res.end(buf);
      }

      if (url.pathname === '/render' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as RenderBody;
        const { spec, imagePath } = specFor(body);
        const out = await renderComposition(spec, {
          outDir: OUT, imagePath,
          fileName: body.fileName ? basename(body.fileName) : undefined,
          canvas: body.canvas, docOverride: body.doc,
        });
        return json(res, 200, {
          ...out,
          url: `/renders/${basename(out.path)}`,
          spec: { archetype: spec.archetype.key, layout: spec.layout, skin: spec.skin.key, accents: spec.accents },
          // Which optional fields this claim actually carries, so the editor can
          // grey out bindings that would vanish on the sample being previewed.
          present: [...presentFields(spec.model, spec.brand)],
        });
      }

      if (url.pathname === '/carousel' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand: string; claims: Claim[] };
        const specs = composeCarousel(brandByKey(body.brand), body.claims.map((c) => ({ ...c, observedAt: new Date(c.observedAt) })));
        const images = [];
        for (const spec of specs) images.push(await renderComposition(spec, { outDir: OUT, imagePath: spec.model.imageUrl }));
        return json(res, 200, { images, skin: specs[0]!.skin.key, width: 1080, height: 1350 });
      }

      // The visual editor's read/write surface: the dashboard is a thin proxy to
      // these two routes, never touching the brand config files itself — the
      // renderer is the one process that actually resolves an override at render
      // time, so it's the one process that owns saving and clearing them too.
      if (url.pathname === '/layout-override' && req.method === 'GET') {
        const brand = url.searchParams.get('brand') ?? 'f1';
        const archetype = url.searchParams.get('archetype') ?? '';
        const layout = url.searchParams.get('layout') ?? '';
        if (!archetype || !layout) return json(res, 400, { error: 'archetype and layout are required' });
        return json(res, 200, { override: getLayoutOverride(brand, archetype, layout) });
      }

      if (url.pathname === '/layout-override' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; archetype?: string; layout?: string; patch?: Partial<LayoutOverride> };
        if (!body.archetype || !body.layout) return json(res, 400, { error: 'archetype and layout are required' });
        brandByKey(body.brand ?? 'f1'); // 404s on an unknown brand before touching the filesystem
        const saved = saveLayoutOverride(body.brand ?? 'f1', body.archetype, body.layout, body.patch ?? {});
        return json(res, 200, { override: saved });
      }

      if (url.pathname === '/layout-override/clear' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; archetype?: string; layout?: string };
        if (!body.archetype || !body.layout) return json(res, 400, { error: 'archetype and layout are required' });
        clearLayoutOverride(body.brand ?? 'f1', body.archetype, body.layout);
        return json(res, 200, { override: {} });
      }

      /* ---------------------------------------------------- layout documents */

      if (url.pathname === '/layout-doc' && req.method === 'GET') {
        const brand = url.searchParams.get('brand') ?? 'f1';
        const archetype = url.searchParams.get('archetype') ?? '';
        const layout = url.searchParams.get('layout') ?? '';
        if (!archetype || !layout) return json(res, 400, { error: 'archetype and layout are required' });
        return json(res, 200, {
          doc: getLayoutDoc(brand, archetype, layout),
          fields: FIELDS,
          canvases: CANVAS_KEYS.map((k) => CANVASES[k]),
        });
      }

      if (url.pathname === '/layout-doc' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; archetype?: string; layout?: string; doc?: unknown };
        if (!body.archetype || !body.layout) return json(res, 400, { error: 'archetype and layout are required' });
        brandByKey(body.brand ?? 'f1');
        try {
          return json(res, 200, { doc: saveLayoutDoc(body.brand ?? 'f1', body.archetype, body.layout, body.doc) });
        } catch (e) {
          return json(res, 400, { error: (e as Error).message });
        }
      }

      /** Fork the built-in CSS layout into an editable document. This is the
       *  only way a document comes into existence — starting from something
       *  that already renders correctly beats starting from an empty frame. */
      if (url.pathname === '/layout-doc/seed' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; archetype?: string; layout?: LayoutKey };
        if (!body.archetype || !body.layout) return json(res, 400, { error: 'archetype and layout are required' });
        brandByKey(body.brand ?? 'f1');
        const seeded = saveLayoutDoc(body.brand ?? 'f1', body.archetype, body.layout, seedDoc(body.layout));
        return json(res, 200, { doc: seeded });
      }

      if (url.pathname === '/layout-doc/delete' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; archetype?: string; layout?: string };
        if (!body.archetype || !body.layout) return json(res, 400, { error: 'archetype and layout are required' });
        deleteLayoutDoc(body.brand ?? 'f1', body.archetype, body.layout);
        return json(res, 200, { doc: null });
      }

      /* --------------------------------------------------------- brand theme */
      // The saved brand palette and fonts — as opposed to /layout-doc's
      // per-node colours and fonts, which win for one layer in one document.
      // `effective` is what brandByKey() actually hands every render right
      // now (coded defaults + this override); `override` is only what's been
      // explicitly replaced, which is what the editor needs to know whether a
      // given colour/font shows as "brand default" or "custom".

      if (url.pathname === '/theme' && req.method === 'GET') {
        const brandKey = url.searchParams.get('brand') ?? 'f1';
        const effective = brandByKey(brandKey); // applies the override already
        return json(res, 200, {
          override: loadThemeOverride(brandKey),
          effective: {
            skins: effective.skins.map((s) => ({
              key: s.key, bg: s.bg, panel: s.panel, fg: s.fg, muted: s.muted, line: s.line, fallbackAccent: s.fallbackAccent,
            })),
            fonts: effective.tokens.fonts,
            letterSpacing: effective.tokens.ls,
          },
        });
      }

      if (url.pathname === '/theme' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; patch?: Partial<ThemeOverride> };
        const brandKey = body.brand ?? 'f1';
        brandByKey(brandKey); // 404s on an unknown brand before touching the filesystem
        const saved = saveThemeOverride(brandKey, body.patch ?? {});
        return json(res, 200, { override: saved });
      }

      if (url.pathname === '/theme/clear' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; skin?: string; role?: SkinColourRole; font?: FontSlot; letterSpacing?: LetterSpacingSlot };
        const brandKey = body.brand ?? 'f1';
        brandByKey(brandKey);
        const saved = clearThemeOverride(brandKey, { skin: body.skin, role: body.role, font: body.font, letterSpacing: body.letterSpacing });
        if (body.font) invalidateBrandFontsCache(brandKey);
        return json(res, 200, { override: saved });
      }

      /** Fetches a Google Font on demand (never at render time — see
       *  google-fonts.ts) and pins it as the brand's font for that slot. */
      if (url.pathname === '/theme/font' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; slot?: FontSlot; family?: string; weights?: number[] };
        const brandKey = body.brand ?? 'f1';
        if (!body.slot || !FONT_SLOTS.includes(body.slot)) return json(res, 400, { error: 'slot must be one of display, body, mono' });
        if (!body.family?.trim()) return json(res, 400, { error: 'family is required' });
        brandByKey(brandKey);
        try {
          const { family, weights } = await fetchGoogleFont(brandKey, body.family, body.weights);
          invalidateBrandFontsCache(brandKey);
          const saved = saveThemeOverride(brandKey, { fonts: { [body.slot]: { family, google: true } } });
          return json(res, 200, { override: saved, weights });
        } catch (e) {
          return json(res, 502, { error: (e as Error).message });
        }
      }

      /** The other way a designer gets a font in: their own file, base64 in
       *  the body (JSON keeps this endpoint symmetric with /theme/font — no
       *  separate multipart parser to maintain for one route). */
      if (url.pathname === '/theme/font/upload' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand?: string; slot?: FontSlot; family?: string; weight?: number; fileBase64?: string };
        const brandKey = body.brand ?? 'f1';
        if (!body.slot || !FONT_SLOTS.includes(body.slot)) return json(res, 400, { error: 'slot must be one of display, body, mono' });
        if (!body.family?.trim()) return json(res, 400, { error: 'family is required' });
        if (!body.fileBase64) return json(res, 400, { error: 'file is required' });
        brandByKey(brandKey);
        try {
          const bytes = Buffer.from(body.fileBase64, 'base64');
          const weight = Number.isFinite(body.weight) ? Math.min(900, Math.max(100, Math.round(body.weight! / 100) * 100)) : 400;
          const { family } = pinUploadedFont(brandKey, body.family.trim().slice(0, 80), weight, bytes);
          invalidateBrandFontsCache(brandKey);
          const saved = saveThemeOverride(brandKey, { fonts: { [body.slot]: { family, google: false } } });
          return json(res, 200, { override: saved, weight });
        } catch (e) {
          return json(res, 400, { error: (e as Error).message });
        }
      }

      if (url.pathname === '/goldens/run' && req.method === 'POST') {
        if (goldenJob.running) return json(res, 409, { error: 'a certification run is already in progress' });
        startGoldenRun();
        return json(res, 202, { started: true });
      }

      if (url.pathname === '/goldens/status' && req.method === 'GET') {
        return json(res, 200, goldenJob);
      }

      if (url.pathname === '/variants' && req.method === 'POST') {
        // "Render all variants" for one fixture. Capped so the lab stays usable.
        const body = JSON.parse(await readBody(req)) as RenderBody & { limit?: number; offset?: number };
        const brand = brandByKey(body.brand ?? 'f1');
        const fixture = loadFixture(body.fixture ?? 'classification-basic');
        const archetypeKey = body.archetype ?? brand.archetypes.find((a) => a.claimTypes.includes(fixture.claim.claimType))?.key;
        const variants = enumerateVariants(brand, archetypeKey ?? '').slice(body.offset ?? 0, (body.offset ?? 0) + Math.min(40, body.limit ?? 20));
        const results = [];
        for (const v of variants) {
          try {
            const { spec, imagePath } = specFor({ ...body, fixture: fixture.name, archetype: archetypeKey, layout: v.layout, skin: v.skin, accents: v.accents });
            const out = await renderComposition(spec, { outDir: OUT, imagePath });
            results.push({ ...v, url: `/renders/${basename(out.path)}`, ms: out.ms, guards: out.guards });
          } catch (e) {
            results.push({ ...v, error: (e as Error).message });
          }
        }
        return json(res, 200, { archetype: archetypeKey, results, total: enumerateVariants(brand, archetypeKey ?? '').length, nextOffset: (body.offset ?? 0) + variants.length });
      }

      res.writeHead(404); res.end('not found');
    } catch (e) {
      json(res, 500, { error: (e as Error).message, stack: (e as Error).stack?.split('\n').slice(0, 4) });
    }
  });
  server.listen(port, () => console.log(JSON.stringify({ stage: 'render', msg: `renderer listening on :${port}`, out: OUT })));
  return server;
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let data = '';
    // 8MB, not 2MB: a base64-encoded font upload inflates ~33% over the raw
    // file, and a variable/CJK-capable font can genuinely run a few MB.
    req.on('data', (c) => { data += c; if (data.length > 8_000_000) { rej(new Error('request too large')); req.destroy(); } });
    req.on('end', () => res(data || '{}'));
    req.on('error', rej);
  });
}
