/**
 * The bindable field catalogue — the vocabulary a document can bind against.
 *
 * Deliberately scoped to what the archetype already computed (ArtModel) plus a
 * few brand constants, rather than the raw Claim. The archetype is where a
 * claim's messy shape is turned into something safe to draw: it decides what
 * counts as the headline, resolves entity colours, and is covered by tests. A
 * document binding straight to a raw claim path would route around all of
 * that, and would silently produce an empty element the first time a source
 * changed its schema.
 *
 * Every field carries a `type`, and binding is type-checked: text binds to
 * text, image to image, rows to rows. That constraint is lifted directly from
 * how Figma Buzz and Canva's data autofill behave, and it exists because the
 * failure it prevents — an image URL rendered as a text string — is silent.
 */

import type { ArtModel, Brand } from './types.ts';
import type { Format, TextSource } from './doc.ts';

export type FieldType = 'text' | 'image' | 'rows';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Grouping for the editor's field palette. */
  group: 'Content' | 'Context' | 'Brand';
  /** Whether the archetype guarantees this is present. Optional fields are the
   *  ones whose nodes will auto-hide, so the editor can warn when one is used
   *  somewhere structural. */
  optional: boolean;
  hint?: string;
}

export const FIELDS: FieldDef[] = [
  { key: 'headline', label: 'Headline', type: 'text', group: 'Content', optional: false, hint: 'The claim itself. Length varies wildly — bind this to a node set to Fit.' },
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'Content', optional: false, hint: 'Short category label above the headline.' },
  { key: 'subhead', label: 'Subhead', type: 'text', group: 'Content', optional: true },
  { key: 'bigNumber', label: 'Big number', type: 'text', group: 'Content', optional: true, hint: 'Present only on archetypes built around one figure.' },
  { key: 'bigLabel', label: 'Big number label', type: 'text', group: 'Content', optional: true },
  { key: 'quote', label: 'Quote', type: 'text', group: 'Content', optional: true },
  { key: 'attribution', label: 'Attribution', type: 'text', group: 'Content', optional: true },
  { key: 'footnote', label: 'Footnote', type: 'text', group: 'Context', optional: false, hint: 'Source and timestamp. Required for editorial traceability.' },
  { key: 'rows', label: 'Table rows', type: 'rows', group: 'Content', optional: true },
  { key: 'imageUrl', label: 'Photo', type: 'image', group: 'Content', optional: true },
  { key: 'entity.name', label: 'Entity name', type: 'text', group: 'Context', optional: true, hint: 'Driver, team or tournament this claim is about.' },
  { key: 'brand.name', label: 'Brand name', type: 'text', group: 'Brand', optional: false },
  { key: 'brand.logoText', label: 'Logo wordmark', type: 'text', group: 'Brand', optional: false },
  { key: 'brand.logoMark', label: 'Logo mark', type: 'text', group: 'Brand', optional: false },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function fieldsOfType(type: FieldType): FieldDef[] {
  return FIELDS.filter((f) => f.type === type);
}

/** The raw value behind a field key, before formatting. */
export function readField(key: string, model: ArtModel, brand: Brand): string | null {
  switch (key) {
    case 'headline': return model.headline || null;
    case 'eyebrow': return model.eyebrow || null;
    case 'subhead': return model.subhead || null;
    case 'bigNumber': return model.bigNumber || null;
    case 'bigLabel': return model.bigLabel || null;
    case 'quote': return model.quote || null;
    case 'attribution': return model.attribution || null;
    case 'footnote': return model.footnote || null;
    case 'imageUrl': return model.imageUrl || null;
    case 'entity.name': return model.entity?.name || null;
    case 'brand.name': return brand.name || null;
    case 'brand.logoText': return brand.tokens.logo.text || null;
    case 'brand.logoMark': return brand.tokens.logo.mark || null;
    default: return null;
  }
}

export function applyFormats(value: string, formats: Format[] | undefined): string {
  let out = value;
  for (const f of formats ?? []) {
    switch (f.key) {
      case 'upper': out = out.toUpperCase(); break;
      case 'lower': out = out.toLowerCase(); break;
      case 'truncate': {
        const n = typeof f.arg === 'number' ? f.arg : 60;
        // Ellipsis counts toward the budget, so a truncate:20 is never 21 chars.
        if (out.length > n) out = `${out.slice(0, Math.max(1, n - 1)).trimEnd()}…`;
        break;
      }
      case 'prefix': out = `${f.arg ?? ''}${out}`; break;
      case 'suffix': out = `${out}${f.arg ?? ''}`; break;
    }
  }
  return out;
}

/**
 * Resolve a text node's content. Returns null when there is nothing to draw —
 * the renderer takes that as "omit this node entirely", which is what makes a
 * stack close its own gap rather than leave a hole. A `fallback` on the
 * binding opts that node out of disappearing, for the cases where a stable
 * geometry matters more than an empty slot.
 */
export function resolveText(source: TextSource, model: ArtModel, brand: Brand): string | null {
  if (source.type === 'static') return source.value || null;
  const raw = readField(source.field, model, brand);
  if (raw === null || raw === '') return source.fallback ?? null;
  return applyFormats(raw, source.format) || null;
}

/** Which optional fields this particular claim actually has — the editor
 *  greys out bindings that would vanish on the sample being previewed, so
 *  "why is my element missing" is answerable without reading code. */
export function presentFields(model: ArtModel, brand: Brand): Set<string> {
  const out = new Set<string>();
  for (const f of FIELDS) {
    if (f.type === 'rows') { if (model.rows?.length) out.add(f.key); continue; }
    if (readField(f.key, model, brand)) out.add(f.key);
  }
  return out;
}
