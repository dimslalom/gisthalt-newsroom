/**
 * The open colour model. A node used to be able to say only "this is
 * `accent-text`" — a name from a closed brand-token set. That is still the
 * common case and still resolves the same way, but a document may now also
 * say "this is `#EF4444` at 70% alpha" or "a linear gradient between two
 * palette slots" — Figma's model: token references and raw literals coexist,
 * and either can appear anywhere a colour is expected.
 *
 * Resolution always emits a literal hex/rgba string, never `var(--x)`. That is
 * the one property this module exists to guarantee: the contrast scanner
 * (guards/contrast-scan.ts) needs the *exact* resolved value to measure real
 * ratios, and a CSS custom property is opaque to it.
 */

import { COLOUR_ROLES, type ColourRole, type LayoutDoc } from './doc.ts';
import type { CompositionSpec } from './types.ts';

/** A named reference (brand token role, or a document palette slot key) or a
 *  literal hex value. */
export type Colour = { ref: string } | { hex: string; alpha?: number };

export interface PaintStop { at: number; colour: Colour }

export interface Paint {
  type: 'none' | 'solid' | 'linear' | 'radial';
  colour?: Colour;
  stops?: PaintStop[];
  /** Linear only, degrees. */
  angle?: number;
  opacity?: number;
}

/** Resolved hex per brand-token colour role (COLOUR_ROLES), plus whatever a
 *  document's palette variant supplies for its own slot keys. Both are literal
 *  `#rrggbb` (or `#rgb`) — the same shape resolveColours() already produces. */
export interface PaintContext {
  tokenHex: Record<string, string>;
  paletteColours?: Record<string, string>;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normaliseHex(hex: string): string {
  const h = hex.trim();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h.toLowerCase();
}

/** Clamp-don't-reject, matching doc.ts's house style: a malformed colour
 *  degrades to a safe default rather than aborting the whole document. */
export function sanitiseColour(v: unknown, dflt: Colour = { ref: 'fg' }): Colour {
  if (typeof v === 'string') {
    // Bare-string legacy shape (every colour before this module existed) —
    // a token role name — resolves exactly as before, just through `ref`.
    return { ref: v.slice(0, 64) };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.hex === 'string' && HEX_RE.test(o.hex.trim())) {
      const out: Colour = { hex: normaliseHex(o.hex) };
      if (typeof o.alpha === 'number' && Number.isFinite(o.alpha)) out.alpha = Math.min(1, Math.max(0, o.alpha));
      return out;
    }
    if (typeof o.ref === 'string' && o.ref) return { ref: o.ref.slice(0, 64) };
  }
  return dflt;
}

export function sanitisePaintStop(v: unknown): PaintStop | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? Math.min(1, Math.max(0, o.at)) : null;
  if (at === null) return null;
  return { at, colour: sanitiseColour(o.colour) };
}

/** background/fill: accepts the legacy bare-role-string and 'none' shapes
 *  (every document saved before this module existed) alongside the full Paint
 *  object, so old brands/<key>/layouts.json files keep rendering unchanged. */
export function sanitisePaint(v: unknown, dflt: Paint = { type: 'none' }): Paint {
  if (v === undefined || v === null || v === 'none') return { type: 'none' };
  if (typeof v === 'string') return { type: 'solid', colour: { ref: v.slice(0, 64) } };
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const type = (['none', 'solid', 'linear', 'radial'] as const).includes(o.type as never) ? (o.type as Paint['type']) : 'solid';
    if (type === 'none') return { type: 'none' };
    const out: Paint = { type };
    if (typeof o.opacity === 'number' && Number.isFinite(o.opacity)) out.opacity = Math.min(1, Math.max(0, o.opacity));
    if (type === 'solid') {
      out.colour = sanitiseColour(o.colour);
      return out;
    }
    // linear / radial
    const stops = Array.isArray(o.stops) ? o.stops.map(sanitisePaintStop).filter((s): s is PaintStop => s !== null).slice(0, 8) : [];
    out.stops = stops.length >= 2 ? stops : [{ at: 0, colour: { ref: 'bg' } }, { at: 1, colour: { ref: 'accent' } }];
    if (type === 'linear') out.angle = typeof o.angle === 'number' && Number.isFinite(o.angle) ? ((o.angle % 360) + 360) % 360 : 180;
    return out;
  }
  return dflt;
}

function hexToRgba(hex: string, alpha?: number): string {
  const h = normaliseHex(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return alpha === undefined || alpha >= 1 ? normaliseHex(hex) : `rgba(${r},${g},${b},${alpha})`;
}

/** Resolves against the document's own palette slots first — a document's
 *  raw-colour declarations win over the brand's token set, since that's the
 *  whole point of a document owning colour at all — then brand token roles. */
export function resolveColour(colour: Colour, ctx: PaintContext): string {
  if ('hex' in colour) return hexToRgba(colour.hex, colour.alpha);
  const ref = colour.ref;
  if (ctx.paletteColours && ref in ctx.paletteColours) return ctx.paletteColours[ref]!;
  if (ref in ctx.tokenHex) return ctx.tokenHex[ref]!;
  if ((COLOUR_ROLES as readonly string[]).includes(ref) && ctx.tokenHex.fg) return ctx.tokenHex.fg;
  return ctx.tokenHex.fg ?? '#000000';
}

export function resolvePaint(paint: Paint, ctx: PaintContext): string {
  if (paint.type === 'none') return 'transparent';
  if (paint.type === 'solid') return resolveColour(paint.colour ?? { ref: 'fg' }, ctx);
  const stops = (paint.stops ?? []).map((s) => `${resolveColour(s.colour, ctx)} ${(s.at * 100).toFixed(1)}%`).join(', ');
  return paint.type === 'linear' ? `linear-gradient(${paint.angle ?? 180}deg, ${stops})` : `radial-gradient(circle, ${stops})`;
}

/** The document's own literal-colour context: brand token roles resolved to
 *  hex (the same values resolveColours() already computed for the CSS
 *  variables) plus, when the document declares one, its active palette
 *  variant's colours. `ref`s resolve against the palette first. */
export function buildPaintContext(doc: LayoutDoc, spec: CompositionSpec, vars: Record<string, string>): PaintContext {
  const tokenHex: Record<string, string> = {};
  for (const role of COLOUR_ROLES) tokenHex[role] = vars[`--${role}`] ?? '#000000';
  const variant = doc.palette
    ? doc.palette.variants.find((v) => v.key === spec.paletteVariant) ?? doc.palette.variants[0]
    : undefined;
  return { tokenHex, paletteColours: variant?.colours };
}

export type { ColourRole };
