import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * "A layout that has not passed the full fixture set cannot be selected by the
 * composer" — enforced here, in code, rather than by discipline.
 *
 * Certification is per brand+archetype+layout, not global: `shared` covers the
 * code and pinned assets every layout depends on, and each entry in `layouts`
 * additionally covers only that one brand's compiled source and that one
 * `layouts.json` entry. Editing a single layout therefore only ever
 * de-certifies that single key — see layoutFingerprint() below.
 *
 * The manifest is written by scripts/render-goldens.ts.
 */
export interface LayoutCertification { fp: string; ok: boolean }

export interface PassingManifest {
  generatedAt: string;
  runtime?: string;
  fixtures: string[];
  /** Fingerprint of the code and assets every layout depends on. */
  shared: string;
  /** Keyed by `${brandKey}/${archetype}/${layout}`. */
  layouts: Record<string, LayoutCertification>;
}

function certRoot(fixtureDir = process.env.FIXTURE_DIR ?? resolve(fileURLToPath(import.meta.url), '../../../../fixtures')): string {
  return resolve(fixtureDir, '..');
}

function hashTree(hash: ReturnType<typeof createHash>, root: string, relative: string, skip?: (name: string) => boolean): void {
  const path = resolve(root, relative);
  if (!existsSync(path)) throw new Error(`missing certification input: ${relative}`);
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (['node_modules', 'goldens', 'passing.json'].includes(entry.name)) continue;
    if (skip?.(entry.name)) continue;
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) hashTree(hash, root, next, skip);
    else if (/\.(ts|json|css|ttf|woff2|png)$/.test(entry.name)) hash.update(next).update(readFileSync(resolve(root, next)));
  }
}

/** Code and pinned assets shared by every brand and every layout. */
export function sharedFingerprint(root = certRoot()): string {
  const hash = createHash('sha256');
  for (const dir of ['packages/design/src', 'packages/render/src', 'packages/render/assets', 'fixtures']) hashTree(hash, root, dir);
  return hash.digest('hex');
}

/** One brand+archetype+layout's certification input: the shared hash, that
 *  brand's compiled source, and the single `layouts.json` entry for this
 *  pair — never the whole `brands/` tree, so a sibling layout or a different
 *  brand editing its own document never disturbs this fingerprint. */
export function layoutFingerprint(brandKey: string, archetype: string, layout: string, root = certRoot()): string {
  const hash = createHash('sha256');
  hash.update(sharedFingerprint(root));
  hashTree(hash, root, `brands/${brandKey}`, (name) => name === 'layouts.json');
  const layoutsPath = resolve(root, 'brands', brandKey, 'layouts.json');
  if (existsSync(layoutsPath)) {
    try {
      const file = JSON.parse(readFileSync(layoutsPath, 'utf8')) as Record<string, Record<string, unknown>>;
      const entry = file[archetype]?.[layout];
      if (entry !== undefined) hash.update(JSON.stringify(entry));
    } catch {
      // A malformed layouts.json degrades to "no document for this pair",
      // same as doc-store's own load path — not a certification crash.
    }
  }
  return hash.digest('hex');
}

/** @deprecated kept only as the old global-fingerprint shape for callers that
 *  have not migrated; prefer sharedFingerprint()/layoutFingerprint(). */
export function designFingerprint(fixtureDir?: string): string {
  return sharedFingerprint(certRoot(fixtureDir));
}

let cached: PassingManifest | null | undefined;

export function loadPassing(path = resolve(process.env.FIXTURE_DIR ?? resolve(resolve(fileURLToPath(import.meta.url), '..'), '../../../fixtures'), 'passing.json')): PassingManifest | null {
  if (cached !== undefined) return cached;
  cached = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as PassingManifest) : null;
  if (cached && cached.runtime !== 'linux') cached = null;
  return cached;
}

export function resetPassingCache(): void { cached = undefined; }

export function isLayoutShippable(brandKey: string, archetype: string, layout: string, manifest = loadPassing()): boolean {
  // Missing or stale certification fails closed.
  if (!manifest || manifest.fixtures.length < 10) return false;
  const key = `${brandKey}/${archetype}/${layout}`;
  const cert = manifest.layouts[key];
  if (!cert || !cert.ok) return false;
  return cert.fp === layoutFingerprint(brandKey, archetype, layout);
}
