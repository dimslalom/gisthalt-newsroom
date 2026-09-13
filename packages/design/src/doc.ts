/**
 * L3, rewritten as data.
 *
 * A layout used to be a block of CSS rules that nudged one hand-written HTML
 * skeleton (see template.ts). That made "design" mean "pick one of eight", and
 * left nothing for an editor to add an element *to*. A LayoutDoc is the
 * inversion: the document is a tree, the renderer is an interpreter, and the
 * editor edits the tree.
 *
 * One rule holds the whole format together, and exists because this system
 * renders claims nobody has read yet: geometry is intent, not pixels. A node
 * says "stack vertically, hug your content, fill the remaining space" — never
 * "you are 512px tall at y=740". That is what lets one document render at 4:5,
 * 1:1 and 9:16, and what lets a headline twice as long as the sample still
 * fit. Absolute placement exists but is an explicit per-node opt-out, never a
 * default.
 *
 * Colour and type used to be closed sets too — a document could say
 * "`accent-text` at the `h1` step" but never "#EF4444 at 68px". That's now
 * open (see paint.ts): any colour may be a literal, any font step may be a raw
 * pixel size. What still holds is that resolution always produces an exact,
 * literal value — the contrast scanner (guards/contrast-scan.ts) measures that
 * exact value per node against its real backdrop, live in the editor, and
 * certification still hard-fails a failing document.
 */

import { sanitiseColour, sanitisePaint, type Colour, type Paint } from './paint.ts';

/** The output sizes one document can be rendered at. Authoring happens at one
 *  of these; the others fall out of the layout intent rather than being
 *  separately designed. */
export const CANVASES = {
  'portrait-4x5': { key: 'portrait-4x5', label: 'Feed 4:5', width: 1080, height: 1350 },
  square: { key: 'square', label: 'Feed 1:1', width: 1080, height: 1080 },
  story: { key: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
} as const;
export type CanvasKey = keyof typeof CANVASES;
export const CANVAS_KEYS = Object.keys(CANVASES) as CanvasKey[];
export const DEFAULT_CANVAS: CanvasKey = 'portrait-4x5';

/* ------------------------------------------------------------------ tokens */

/** Type steps, by token name. `fit` hands the node to the fitText binary
 *  search instead of pinning a step — the only correct choice for a headline
 *  whose content length is unknown at design time. */
export const FONT_STEPS = ['mega', 'hero', 'h1', 'h2', 'body', 'lab', 'fine', 'fit'] as const;
export type FontStep = (typeof FONT_STEPS)[number];

/** Every colour a node may name. Each resolves to a CSS custom property that
 *  resolveColours() has already contrast-checked for this skin + entity. */
export const COLOUR_ROLES = ['fg', 'muted', 'accent-text', 'accent', 'on-accent', 'bg', 'panel', 'line'] as const;
export type ColourRole = (typeof COLOUR_ROLES)[number];

export const FONT_FAMILIES = ['display', 'body', 'mono'] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/** A brand font token, or a raw CSS family the designer typed. Both are
 *  first-class: a document can say "use the brand's display font" or "use
 *  Impact", exactly like colour's token-vs-literal split. */
export type FontSpec = { token: FontFamily } | { family: string };

/** Either a named step from the brand's type scale, or a literal pixel size —
 *  the free-typography escape hatch. `fit` only has meaning as the named step. */
export type StepSpec = FontStep | { px: number };

/* ------------------------------------------------------------------ sizing */

export type SizeMode =
  | 'hug'   // as large as the content needs, no larger
  | 'fill'  // absorb the free space on the parent's main axis
  | 'fixed'; // an explicit px measurement — the one escape hatch

export interface Size {
  mode: SizeMode;
  /** Only meaningful when mode is 'fixed'. */
  px?: number;
}

export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type TextAlign = 'left' | 'center' | 'right';

/** Flow is the default and keeps the node in its parent's stack. Absolute
 *  lifts it out — the deliberate opt-out for decoration that must overlap. */
export type Position =
  | { mode: 'flow' }
  | {
      mode: 'absolute';
      /** Insets as a fraction of the canvas (0-1), not pixels, so an absolutely
       *  placed node still lands somewhere sane when the same document is
       *  rendered at a different aspect ratio. */
      top?: number; right?: number; bottom?: number; left?: number;
      width?: number; height?: number;
    };

/* ------------------------------------------------------------------- nodes */

export interface NodeBase {
  id: string;
  /** The layer name shown in the editor. Free text, purely for the human. */
  name: string;
  hidden?: boolean;
  position?: Position;
  /** Undefined means "whatever the parent stack says" — which is the correct
   *  default, and the reason these are optional rather than defaulted to 'hug'.
   *  Emitting an explicit hug for an unset axis would override the parent's
   *  own align:stretch and shrink every child to its text width. */
  width?: Size;
  height?: Size;
  /** 0-1. Below 1 the contrast guard can no longer vouch for this node, so the
   *  editor warns when it is used on text. */
  opacity?: number;
  /** Any node can carry a plate — a solid fill, a gradient, or none. On text
   *  over a photo this is what replaces the template's automatic backplate,
   *  and unlike that rule it's visible and editable rather than an invisible
   *  consequence of there being an image. */
  background?: Paint;
  /** Per-side, in spacing units. */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
}

/** A stack. The only container, deliberately: one well-understood layout
 *  primitive composes into everything the eight built-in layouts did. */
export interface FrameNode extends NodeBase {
  kind: 'frame';
  axis: 'vertical' | 'horizontal';
  /** In spacing units (the brand's `unit` token), not pixels. */
  gap?: number;
  /** Cross-axis alignment of children. */
  align?: Align;
  /** Main-axis distribution of children. */
  justify?: Justify;
  children: LayoutNode[];
}

export interface TextNode extends NodeBase {
  kind: 'text';
  source: TextSource;
  font?: FontSpec;
  step?: StepSpec;
  /** Only read when step is 'fit'. */
  fit?: { minPx: number; maxPx: number; lines: number };
  colour?: Colour;
  align?: TextAlign;
  transform?: 'none' | 'uppercase' | 'lowercase';
  weight?: number;
  /** Hard ceiling on rendered lines; overflow ellipsises rather than spills. */
  maxLines?: number;
  /** Raw CSS letter-spacing (e.g. "0.02em"); overrides the step's default. */
  letterSpacing?: string;
  /** Overrides the step's default leading when set. */
  lineHeight?: number;
  italic?: boolean;
}

export interface ImageNode extends NodeBase {
  kind: 'image';
  /** Only ever the claim's own image. There is no upload path on purpose:
   *  an unattended pipeline must not depend on an asset a human forgot. */
  source: { type: 'field'; field: 'imageUrl' };
  fit?: 'cover' | 'contain';
  /** 0-1 each, the CSS object-position focal point. */
  focal?: { x: number; y: number };
  treatment?: 'none' | 'duotone' | 'grayscale';
  /** Darkening gradient under text. Strength is resolved from the render-time
   *  guard, not stored, so a bright photo still gets the scrim it needs. */
  scrim?: boolean;
}

export interface RowsNode extends NodeBase {
  kind: 'rows';
  source: { type: 'field'; field: 'rows' };
  density?: 'auto' | 'dense' | 'roomy';
  /** Which of TableRow's fields to draw, in order. */
  columns?: ('rank' | 'chip' | 'primary' | 'secondary' | 'value' | 'trailing')[];
}

export interface LogoNode extends NodeBase {
  kind: 'logo';
  /** 'auto' uses the brand's SVG mark when it has one, else the text lockup. */
  variant?: 'auto' | 'svg' | 'text' | 'mark';
}

export interface ShapeNode extends NodeBase {
  kind: 'shape';
  shape: 'rect' | 'line';
  colour?: Colour;
  /** Line thickness in px; rect corner radius comes from the brand token. */
  thickness?: number;
}

export type LayoutNode = FrameNode | TextNode | ImageNode | RowsNode | LogoNode | ShapeNode;
export type NodeKind = LayoutNode['kind'];

export const NODE_KINDS: NodeKind[] = ['frame', 'text', 'image', 'rows', 'logo', 'shape'];

/* --------------------------------------------------------------- bindings */

/** Where a text node's content comes from. Static is a literal the designer
 *  typed; field is a live binding to extracted data. Both are first-class —
 *  a label reading "FINAL CLASSIFICATION" is legitimately static. */
export type TextSource =
  | { type: 'static'; value: string }
  | { type: 'field'; field: string; format?: Format[]; fallback?: string };

/** Applied left to right. Kept deliberately small: formatting that changes
 *  meaning belongs in the archetype, where it is testable, not in a document. */
export interface Format {
  key: 'upper' | 'lower' | 'truncate' | 'prefix' | 'suffix';
  arg?: string | number;
}

export const FORMAT_KEYS: Format['key'][] = ['upper', 'lower', 'truncate', 'prefix', 'suffix'];

/* ---------------------------------------------------------------- document */

/** A document's own named colour slots, and 2-5 palettes filling them. Once a
 *  document uses raw colour, brand skins can no longer vary it (a shape
 *  painted `#EF4444` stays `#EF4444` under every skin) — a palette variant is
 *  how the document declares its own colour variation instead of inheriting
 *  the brand's. A `{ref: someSlotKey}` colour resolves against the active
 *  variant's `colours` map before falling back to brand token roles. */
export interface PaletteSlot { key: string; label: string; default: string }
export interface PaletteVariant { key: string; label: string; colours: Record<string, string> }
export interface Palette { slots: PaletteSlot[]; variants: PaletteVariant[] }

export interface LayoutDoc {
  version: 1;
  id: string;
  name: string;
  /** The canvas this was composed against. Other canvases re-resolve from the
   *  same intent rather than storing a second set of geometry. */
  canvas: CanvasKey;
  root: FrameNode;
  /** Absent for a document that names no raw slot — the common case, and
   *  fully backward compatible with every document saved before palettes
   *  existed. */
  palette?: Palette;
}

/* --------------------------------------------------------------- sanitize */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : dflt;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T =>
  allowed.includes(v as T) ? (v as T) : dflt;

let idSeq = 0;
export function newId(prefix = 'n'): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}${idSeq.toString(36)}`;
}

function sanitizeSize(v: unknown): Size | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Partial<Size>;
  const mode = oneOf(s.mode, ['hug', 'fill', 'fixed'] as const, 'hug');
  return mode === 'fixed' ? { mode, px: num(s.px, 1, 4000, 100) } : { mode };
}

function sanitizePosition(v: unknown): Position | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  if (p.mode !== 'absolute') return { mode: 'flow' };
  const out: Position = { mode: 'absolute' };
  for (const k of ['top', 'right', 'bottom', 'left', 'width', 'height'] as const) {
    if (typeof p[k] === 'number' && Number.isFinite(p[k])) {
      (out as Record<string, unknown>)[k] = clamp(p[k] as number, -1, 2);
    }
  }
  return out;
}

function sanitizeFormat(v: unknown): Format | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as Partial<Format>;
  if (!FORMAT_KEYS.includes(f.key as Format['key'])) return null;
  const out: Format = { key: f.key as Format['key'] };
  if (f.key === 'truncate') out.arg = num(f.arg, 1, 500, 60);
  else if (f.key === 'prefix' || f.key === 'suffix') out.arg = String(f.arg ?? '').slice(0, 40);
  return out;
}

function sanitizeSource(v: unknown): TextSource {
  const s = (v ?? {}) as Record<string, unknown>;
  if (s.type === 'field' && typeof s.field === 'string' && s.field) {
    const out: TextSource = { type: 'field', field: s.field.slice(0, 80) };
    if (Array.isArray(s.format)) {
      const fmts = s.format.map(sanitizeFormat).filter((f): f is Format => f !== null).slice(0, 4);
      if (fmts.length) out.format = fmts;
    }
    if (typeof s.fallback === 'string' && s.fallback) out.fallback = s.fallback.slice(0, 200);
    return out;
  }
  return { type: 'static', value: String(s.value ?? '').slice(0, 500) };
}

/** Legacy documents stored `font` as a bare FontFamily string ('display' |
 *  'body' | 'mono'); that shape still resolves as a token reference. */
function sanitizeFont(v: unknown): FontSpec {
  if (typeof v === 'string' && (FONT_FAMILIES as readonly string[]).includes(v)) return { token: v as FontFamily };
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.family === 'string' && o.family) return { family: o.family.slice(0, 80) };
    if (typeof o.token === 'string' && (FONT_FAMILIES as readonly string[]).includes(o.token)) return { token: o.token as FontFamily };
  }
  return { token: 'body' };
}

/** Legacy documents stored `step` as a bare FontStep string; that shape is
 *  still valid and is the only shape that can mean `fit`. */
function sanitizeStep(v: unknown): StepSpec {
  if (typeof v === 'string' && (FONT_STEPS as readonly string[]).includes(v)) return v as FontStep;
  if (v && typeof v === 'object') {
    const px = (v as Record<string, unknown>).px;
    if (typeof px === 'number' && Number.isFinite(px)) return { px: clamp(px, 6, 500) };
  }
  return 'body';
}

/** Depth is capped because the renderer walks this tree recursively and a
 *  hand-edited JSON file is an untrusted input like any other. */
const MAX_DEPTH = 12;
const MAX_NODES = 200;

export function sanitizeNode(input: unknown, ctx = { count: 0 }, depth = 0): LayoutNode | null {
  if (!input || typeof input !== 'object' || depth > MAX_DEPTH || ctx.count >= MAX_NODES) return null;
  ctx.count += 1;
  const n = input as Record<string, unknown>;
  const kind = oneOf(n.kind, NODE_KINDS, 'frame');

  const base: NodeBase = {
    id: typeof n.id === 'string' && n.id ? n.id.slice(0, 64) : newId(kind[0]),
    name: String(n.name ?? kind).slice(0, 60),
  };
  if (n.hidden === true) base.hidden = true;
  const pos = sanitizePosition(n.position);
  if (pos) base.position = pos;
  const w = sanitizeSize(n.width); if (w) base.width = w;
  const h = sanitizeSize(n.height); if (h) base.height = h;
  if (typeof n.opacity === 'number') base.opacity = num(n.opacity, 0, 1, 1);
  if (n.background !== undefined) base.background = sanitisePaint(n.background);
  if (n.padding && typeof n.padding === 'object') {
    const pad = n.padding as Record<string, unknown>;
    const padding: NonNullable<NodeBase['padding']> = {};
    for (const k of ['top', 'right', 'bottom', 'left'] as const) {
      if (typeof pad[k] === 'number') padding[k] = num(pad[k], 0, 60, 0);
    }
    if (Object.keys(padding).length) base.padding = padding;
  }

  switch (kind) {
    case 'frame': {
      const kids = Array.isArray(n.children) ? n.children : [];
      const children = kids
        .map((k) => sanitizeNode(k, ctx, depth + 1))
        .filter((k): k is LayoutNode => k !== null);
      return {
        ...base, kind: 'frame',
        axis: oneOf(n.axis, ['vertical', 'horizontal'] as const, 'vertical'),
        gap: num(n.gap, 0, 40, 0),
        align: oneOf(n.align, ['start', 'center', 'end', 'stretch'] as const, 'stretch'),
        justify: oneOf(n.justify, ['start', 'center', 'end', 'between'] as const, 'start'),
        children,
      };
    }
    case 'text': {
      const step = sanitizeStep(n.step);
      const f = (n.fit ?? {}) as Record<string, unknown>;
      const fit = {
        minPx: num(f.minPx, 8, 300, 34),
        maxPx: num(f.maxPx, 8, 400, 118),
        lines: num(f.lines, 1, 12, 3),
      };
      if (fit.minPx > fit.maxPx) [fit.minPx, fit.maxPx] = [fit.maxPx, fit.minPx];
      return {
        ...base, kind: 'text',
        source: sanitizeSource(n.source),
        font: sanitizeFont(n.font),
        step,
        ...(step === 'fit' ? { fit } : {}),
        colour: sanitiseColour(n.colour),
        align: oneOf(n.align, ['left', 'center', 'right'] as const, 'left'),
        transform: oneOf(n.transform, ['none', 'uppercase', 'lowercase'] as const, 'none'),
        weight: num(n.weight, 100, 900, 400),
        ...(typeof n.maxLines === 'number' ? { maxLines: num(n.maxLines, 1, 20, 3) } : {}),
        ...(typeof n.letterSpacing === 'string' ? { letterSpacing: n.letterSpacing.slice(0, 20) } : {}),
        ...(typeof n.lineHeight === 'number' ? { lineHeight: num(n.lineHeight, 0.5, 3, 1.2) } : {}),
        ...(n.italic === true ? { italic: true } : {}),
      };
    }
    case 'image': {
      const foc = (n.focal ?? {}) as Record<string, unknown>;
      return {
        ...base, kind: 'image',
        source: { type: 'field', field: 'imageUrl' },
        fit: oneOf(n.fit, ['cover', 'contain'] as const, 'cover'),
        focal: { x: num(foc.x, 0, 1, 0.5), y: num(foc.y, 0, 1, 0.35) },
        treatment: oneOf(n.treatment, ['none', 'duotone', 'grayscale'] as const, 'none'),
        scrim: n.scrim !== false,
      };
    }
    case 'rows': {
      const cols = Array.isArray(n.columns) ? n.columns : null;
      const allowed = ['rank', 'chip', 'primary', 'secondary', 'value', 'trailing'] as const;
      return {
        ...base, kind: 'rows',
        source: { type: 'field', field: 'rows' },
        density: oneOf(n.density, ['auto', 'dense', 'roomy'] as const, 'auto'),
        columns: cols
          ? (cols.filter((c) => allowed.includes(c as (typeof allowed)[number])) as RowsNode['columns'])
          : [...allowed],
      };
    }
    case 'logo':
      return { ...base, kind: 'logo', variant: oneOf(n.variant, ['auto', 'svg', 'text', 'mark'] as const, 'auto') };
    case 'shape':
      return {
        ...base, kind: 'shape',
        shape: oneOf(n.shape, ['rect', 'line'] as const, 'rect'),
        colour: sanitiseColour(n.colour, { ref: 'accent' }),
        thickness: num(n.thickness, 1, 200, 3),
      };
  }
}

const MAX_PALETTE_SLOTS = 12;
const MAX_PALETTE_VARIANTS = 5;

function sanitizePaletteSlot(v: unknown): PaletteSlot | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.key !== 'string' || !o.key) return null;
  const dflt = typeof o.default === 'string' ? sanitiseColour({ hex: o.default }, { hex: '#888888' }) : { hex: '#888888' };
  return {
    key: o.key.slice(0, 40),
    label: String(o.label ?? o.key).slice(0, 60),
    default: 'hex' in dflt ? dflt.hex : '#888888',
  };
}

function sanitizePaletteVariant(v: unknown, slots: PaletteSlot[]): PaletteVariant | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.key !== 'string' || !o.key) return null;
  const raw = (o.colours ?? {}) as Record<string, unknown>;
  const colours: Record<string, string> = {};
  for (const slot of slots) {
    const c = typeof raw[slot.key] === 'string' ? sanitiseColour({ hex: raw[slot.key] }, { hex: slot.default }) : { hex: slot.default };
    colours[slot.key] = 'hex' in c ? c.hex : slot.default;
  }
  return { key: o.key.slice(0, 40), label: String(o.label ?? o.key).slice(0, 60), colours };
}

/** 2-5 palettes filling the document's declared colour slots — absent
 *  entirely for a document that names no raw slot, so every existing document
 *  round-trips unchanged. */
function sanitizePalette(v: unknown): Palette | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const slots = (Array.isArray(o.slots) ? o.slots : []).map(sanitizePaletteSlot).filter((s): s is PaletteSlot => s !== null).slice(0, MAX_PALETTE_SLOTS);
  if (!slots.length) return undefined;
  const variants = (Array.isArray(o.variants) ? o.variants : [])
    .map((variant) => sanitizePaletteVariant(variant, slots))
    .filter((p): p is PaletteVariant => p !== null)
    .slice(0, MAX_PALETTE_VARIANTS);
  if (!variants.length) variants.push({ key: 'default', label: 'Default', colours: Object.fromEntries(slots.map((s) => [s.key, s.default])) });
  return { slots, variants };
}

export function sanitizeDoc(input: unknown): LayoutDoc | null {
  if (!input || typeof input !== 'object') return null;
  const d = input as Record<string, unknown>;
  const root = sanitizeNode(d.root ?? {});
  if (!root || root.kind !== 'frame') return null;
  const palette = sanitizePalette(d.palette);
  return {
    version: 1,
    id: typeof d.id === 'string' && d.id ? d.id.slice(0, 64) : newId('doc'),
    name: String(d.name ?? 'Untitled layout').slice(0, 80),
    canvas: oneOf(d.canvas, CANVAS_KEYS, DEFAULT_CANVAS),
    root,
    ...(palette ? { palette } : {}),
  };
}

/* ------------------------------------------------------------ tree helpers */

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.kind !== 'frame') return null;
  for (const c of root.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(root: LayoutNode, id: string): FrameNode | null {
  if (root.kind !== 'frame') return null;
  for (const c of root.children) {
    if (c.id === id) return root;
    const hit = findParent(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Depth-first, parents before children — the order a layers panel reads in. */
export function walk(root: LayoutNode, fn: (n: LayoutNode, depth: number) => void, depth = 0): void {
  fn(root, depth);
  if (root.kind === 'frame') for (const c of root.children) walk(c, fn, depth + 1);
}

export function mapTree(node: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const next = fn(node);
  if (next.kind !== 'frame') return next;
  return { ...next, children: next.children.map((c) => mapTree(c, fn)) };
}

export function removeNode(root: FrameNode, id: string): FrameNode {
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== id)
      .map((c) => (c.kind === 'frame' ? removeNode(c, id) : c)),
  };
}

export function insertNode(root: FrameNode, parentId: string, node: LayoutNode, index?: number): FrameNode {
  if (root.id === parentId) {
    const children = [...root.children];
    children.splice(index ?? children.length, 0, node);
    return { ...root, children };
  }
  return {
    ...root,
    children: root.children.map((c) => (c.kind === 'frame' ? insertNode(c, parentId, node, index) : c)),
  };
}

/** Move a node up or down among its siblings — the layers panel's reorder. */
export function reorderNode(root: FrameNode, id: string, delta: number): FrameNode {
  const idx = root.children.findIndex((c) => c.id === id);
  if (idx >= 0) {
    const next = idx + delta;
    if (next < 0 || next >= root.children.length) return root;
    const children = [...root.children];
    const [moved] = children.splice(idx, 1);
    children.splice(next, 0, moved!);
    return { ...root, children };
  }
  return {
    ...root,
    children: root.children.map((c) => (c.kind === 'frame' ? reorderNode(c, id, delta) : c)),
  };
}
