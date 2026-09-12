import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * "A layout that has not passed the full fixture set cannot be selected by the
 * composer" — enforced here, in code, rather than by discipline.
 * The manifest is written by scripts/render-goldens.ts.
 */
export interface PassingManifest {
  generatedAt: string;
  runtime?: string;
  fingerprint?: string;
  fixtures: string[];
  /** archetype -> layouts that passed every fixture. */
  passing: Record<string, string[]>;
}

/** A baseline certifies the exact code, fixtures and pinned font assets tested. */
export function designFingerprint(fixtureDir = process.env.FIXTURE_DIR ?? resolve(fileURLToPath(import.meta.url), '../../../../fixtures')): string {
  const root = resolve(fixtureDir, '..');
  const hash = createHash('sha256');
  function visit(relative: string) {
    const path = resolve(root, relative);
    if (!existsSync(path)) throw new Error(`missing certification input: ${relative}`);
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (['node_modules', 'goldens', 'passing.json'].includes(entry.name)) continue;
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(next);
      else if (/\.(ts|json|css|ttf|woff2|png)$/.test(entry.name)) hash.update(next).update(readFileSync(resolve(root, next)));
    }
  }
  for (const dir of ['packages/design/src', 'packages/render/src', 'packages/render/assets', 'brands', 'fixtures']) visit(dir);
  return hash.digest('hex');
}

let cached: PassingManifest | null | undefined;

export function loadPassing(path = resolve(process.env.FIXTURE_DIR ?? resolve(resolve(fileURLToPath(import.meta.url), '..'), '../../../fixtures'), 'passing.json')): PassingManifest | null {
  if (cached !== undefined) return cached;
  cached = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as PassingManifest) : null;
  if (cached && (cached.runtime !== 'linux' || cached.fingerprint !== designFingerprint(resolve(path, '..')))) cached = null;
  return cached;
}

export function resetPassingCache(): void { cached = undefined; }

export function isLayoutShippable(archetype: string, layout: string, manifest = loadPassing()): boolean {
  // Missing or stale certification fails closed.
  if (!manifest || manifest.fixtures.length < 10) return false;
  return (manifest.passing[archetype] ?? []).includes(layout);
}
