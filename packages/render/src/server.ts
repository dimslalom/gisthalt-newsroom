import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { compose, composeCarousel, enumerateVariants, SKINS, type Brand, type CompositionSpec, type LayoutKey } from '@newsroom/design';
import type { Claim } from '@newsroom/core';
import { brandByKey, brands } from '@newsroom/brands';
import { loadFixture, fixtureNames } from './fixtures.ts';
import { renderComposition } from './render.ts';

const OUT = resolve(process.env.RENDER_OUT_DIR ?? './.data/renders');

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
  if (body.skin && !SKINS.some(s=>s.key===body.skin)) throw new Error('unknown skin');
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
      skin: body.skin ? SKINS.find((s) => s.key === body.skin) ?? base.skin : base.skin,
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
          skins: SKINS.map((s) => s.key),
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
        const out = await renderComposition(spec, { outDir: OUT, imagePath, fileName: body.fileName ? basename(body.fileName) : undefined });
        return json(res, 200, {
          ...out,
          url: `/renders/${basename(out.path)}`,
          spec: { archetype: spec.archetype.key, layout: spec.layout, skin: spec.skin.key, accents: spec.accents },
        });
      }

      if (url.pathname === '/carousel' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { brand: string; claims: Claim[] };
        const specs = composeCarousel(brandByKey(body.brand), body.claims.map((c) => ({ ...c, observedAt: new Date(c.observedAt) })));
        const images = [];
        for (const spec of specs) images.push(await renderComposition(spec, { outDir: OUT, imagePath: spec.model.imageUrl }));
        return json(res, 200, { images, skin: specs[0]!.skin.key, width: 1080, height: 1350 });
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
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) { rej(new Error('request too large')); req.destroy(); } });
    req.on('end', () => res(data || '{}'));
    req.on('error', rej);
  });
}
