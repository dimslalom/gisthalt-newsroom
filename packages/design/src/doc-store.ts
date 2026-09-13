/**
 * Where documents live: `brands/<key>/layouts.json`, config-as-code exactly
 * like tokens.ts, entities.ts and layout-overrides.json. A design change is a
 * reviewable diff, not a row in a database nobody reads.
 *
 * Documents are keyed by archetype + layout, the same pair the composer
 * already selects. That is what lets this be additive: the composer keeps
 * choosing "penalty / hero-left" from the certified set exactly as before, and
 * only the last step — turning that choice into HTML — asks whether a document
 * exists for the pair. No document, no behaviour change.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sanitizeDoc, type LayoutDoc } from './doc.ts';

/** archetype -> layout -> document. */
export type LayoutDocFile = Record<string, Record<string, LayoutDoc>>;

const cache = new Map<string, LayoutDocFile>();

function pathFor(brandKey: string): string {
  return resolve(process.env.BRANDS_DIR ?? resolve(process.cwd(), 'brands'), brandKey, 'layouts.json');
}

export function loadLayoutDocs(brandKey: string, path = pathFor(brandKey)): LayoutDocFile {
  const cached = cache.get(path);
  if (cached) return cached;
  let file: LayoutDocFile = {};
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>;
      // Sanitize on the way in, not just on the way out of the editor. This
      // file is hand-editable by design, and a malformed node must degrade to
      // "no document for this layout" rather than take the renderer down.
      for (const [arch, layouts] of Object.entries(raw ?? {})) {
        for (const [layout, doc] of Object.entries(layouts ?? {})) {
          const clean = sanitizeDoc(doc);
          if (!clean) continue;
          file[arch] ??= {};
          file[arch][layout] = clean;
        }
      }
    } catch { file = {}; }
  }
  cache.set(path, file);
  return file;
}

export function resetLayoutDocCache(): void { cache.clear(); }

export function getLayoutDoc(brandKey: string, archetype: string, layout: string): LayoutDoc | null {
  return loadLayoutDocs(brandKey)[archetype]?.[layout] ?? null;
}

export function saveLayoutDoc(brandKey: string, archetype: string, layout: string, doc: unknown): LayoutDoc {
  const clean = sanitizeDoc(doc);
  if (!clean) throw new Error('document rejected: root must be a frame');
  const path = pathFor(brandKey);
  const file: LayoutDocFile = { ...loadLayoutDocs(brandKey, path) };
  file[archetype] = { ...file[archetype], [layout]: clean };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  cache.set(path, file);
  return clean;
}

/** Drop back to the built-in CSS layout for this pair. */
export function deleteLayoutDoc(brandKey: string, archetype: string, layout: string): void {
  const path = pathFor(brandKey);
  const file: LayoutDocFile = { ...loadLayoutDocs(brandKey, path) };
  if (file[archetype]) {
    const { [layout]: _gone, ...rest } = file[archetype];
    if (Object.keys(rest).length) file[archetype] = rest; else delete file[archetype];
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  cache.set(path, file);
}
