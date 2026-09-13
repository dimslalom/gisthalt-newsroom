/**
 * The client's copy of the document model.
 *
 * Deliberately duplicated rather than imported from @newsroom/design: that
 * package's barrel pulls in doc-store.ts, which reads and writes the brand
 * config with node:fs. Importing it from a client component would drag
 * filesystem code into the browser bundle. The renderer re-sanitizes
 * everything it is sent anyway, so this copy is a convenience for the editor,
 * never the authority — packages/design/src/doc.ts is.
 */

export type SizeMode = 'hug' | 'fill' | 'fixed';
export interface Size { mode: SizeMode; px?: number }
export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type ColourRole = 'fg' | 'muted' | 'accent-text' | 'accent' | 'on-accent' | 'bg' | 'panel' | 'line';
export type FontStep = 'mega' | 'hero' | 'h1' | 'h2' | 'body' | 'lab' | 'fine' | 'fit';
export type FontFamily = 'display' | 'body' | 'mono';

export const COLOUR_ROLES: ColourRole[] = ['fg', 'muted', 'accent-text', 'accent', 'on-accent', 'bg', 'panel', 'line'];
export const FONT_STEPS: FontStep[] = ['mega', 'hero', 'h1', 'h2', 'body', 'lab', 'fine', 'fit'];
export const FONT_FAMILIES: FontFamily[] = ['display', 'body', 'mono'];

/** A brand token reference, or a literal colour the designer picked — mirrors
 *  packages/design/src/paint.ts's open colour model. The renderer resolves
 *  either to an exact hex, which is what the contrast scanner measures. */
export type Colour = { ref: string } | { hex: string; alpha?: number };
/** A brand font token, or a raw CSS font-family the designer typed. */
export type FontSpec = { token: FontFamily } | { family: string };
export type Paint =
  | { type: 'none' }
  | { type: 'solid'; colour: Colour }
  | { type: 'linear' | 'radial'; stops: { at: number; colour: Colour }[]; angle?: number };

export type Position =
  | { mode: 'flow' }
  | { mode: 'absolute'; top?: number; right?: number; bottom?: number; left?: number; width?: number; height?: number };

export interface Format { key: 'upper' | 'lower' | 'truncate' | 'prefix' | 'suffix'; arg?: string | number }

export type TextSource =
  | { type: 'static'; value: string }
  | { type: 'field'; field: string; format?: Format[]; fallback?: string };

export interface NodeBase {
  id: string; name: string; hidden?: boolean;
  position?: Position; width?: Size; height?: Size; opacity?: number;
  background?: Paint;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface FrameNode extends NodeBase {
  kind: 'frame'; axis: 'vertical' | 'horizontal';
  gap?: number; align?: Align; justify?: Justify; children: LayoutNode[];
}
export interface TextNode extends NodeBase {
  kind: 'text'; source: TextSource; font?: FontSpec; step?: FontStep;
  fit?: { minPx: number; maxPx: number; lines: number };
  colour?: Colour; align?: 'left' | 'center' | 'right';
  transform?: 'none' | 'uppercase'; weight?: number; maxLines?: number;
}
export interface ImageNode extends NodeBase {
  kind: 'image'; source: { type: 'field'; field: 'imageUrl' };
  fit?: 'cover' | 'contain'; focal?: { x: number; y: number };
  treatment?: 'none' | 'duotone' | 'grayscale'; scrim?: boolean;
}
export interface RowsNode extends NodeBase {
  kind: 'rows'; source: { type: 'field'; field: 'rows' };
  density?: 'auto' | 'dense' | 'roomy';
  columns?: ('rank' | 'chip' | 'primary' | 'secondary' | 'value' | 'trailing')[];
}
export interface LogoNode extends NodeBase { kind: 'logo'; variant?: 'auto' | 'svg' | 'text' | 'mark' }
export interface ShapeNode extends NodeBase { kind: 'shape'; shape: 'rect' | 'line'; colour?: Colour; thickness?: number }

export type LayoutNode = FrameNode | TextNode | ImageNode | RowsNode | LogoNode | ShapeNode;
export type NodeKind = LayoutNode['kind'];

export interface LayoutDoc {
  version: 1; id: string; name: string;
  canvas: string; root: FrameNode;
}

export interface FieldDef {
  key: string; label: string; type: 'text' | 'image' | 'rows';
  group: 'Content' | 'Context' | 'Brand'; optional: boolean; hint?: string;
}

export interface CanvasDef { key: string; label: string; width: number; height: number }

/* ------------------------------------------------------------ tree editing */

let seq = 0;
export const newId = (p: string): string => `${p}${Date.now().toString(36)}${(seq += 1).toString(36)}`;

export function findNode(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  if (node.kind !== 'frame') return null;
  for (const c of node.children) { const hit = findNode(c, id); if (hit) return hit; }
  return null;
}

export function findParent(node: LayoutNode, id: string): FrameNode | null {
  if (node.kind !== 'frame') return null;
  for (const c of node.children) {
    if (c.id === id) return node;
    const hit = findParent(c, id); if (hit) return hit;
  }
  return null;
}

/** Replace one node in place, returning a new tree. Every edit goes through
 *  here so undo is a matter of keeping previous roots, not diffing. */
export function updateNode(root: FrameNode, id: string, patch: Partial<LayoutNode>): FrameNode {
  const walk = (n: LayoutNode): LayoutNode => {
    if (n.id === id) return { ...n, ...patch } as LayoutNode;
    return n.kind === 'frame' ? { ...n, children: n.children.map(walk) } : n;
  };
  return walk(root) as FrameNode;
}

export function removeNode(root: FrameNode, id: string): FrameNode {
  const walk = (n: FrameNode): FrameNode => ({
    ...n,
    children: n.children.filter((c) => c.id !== id).map((c) => (c.kind === 'frame' ? walk(c) : c)),
  });
  return walk(root);
}

export function insertNode(root: FrameNode, parentId: string, node: LayoutNode): FrameNode {
  const walk = (n: FrameNode): FrameNode => {
    if (n.id === parentId) return { ...n, children: [...n.children, node] };
    return { ...n, children: n.children.map((c) => (c.kind === 'frame' ? walk(c) : c)) };
  };
  return walk(root);
}

export function reorderNode(root: FrameNode, id: string, delta: number): FrameNode {
  const walk = (n: FrameNode): FrameNode => {
    const i = n.children.findIndex((c) => c.id === id);
    if (i >= 0) {
      const j = i + delta;
      if (j < 0 || j >= n.children.length) return n;
      const kids = [...n.children];
      const [m] = kids.splice(i, 1);
      kids.splice(j, 0, m!);
      return { ...n, children: kids };
    }
    return { ...n, children: n.children.map((c) => (c.kind === 'frame' ? walk(c) : c)) };
  };
  return walk(root);
}

/** Flattened, depth-first — how the layers panel reads. */
export function flatten(root: LayoutNode, depth = 0, out: { node: LayoutNode; depth: number }[] = []) {
  out.push({ node: root, depth });
  if (root.kind === 'frame') for (const c of root.children) flatten(c, depth + 1, out);
  return out;
}

/** A new node of each kind, with defaults chosen to be immediately visible —
 *  an added element that renders as nothing reads as a broken button. */
export function blankNode(kind: NodeKind): LayoutNode {
  const id = newId(kind[0]!);
  switch (kind) {
    case 'frame':
      return { kind: 'frame', id, name: 'Frame', axis: 'vertical', gap: 2, align: 'stretch', justify: 'start', children: [] };
    case 'text':
      return { kind: 'text', id, name: 'Text', source: { type: 'static', value: 'New text' }, font: { token: 'body' }, step: 'body', colour: { ref: 'fg' }, align: 'left', transform: 'none', weight: 400 };
    case 'image':
      return { kind: 'image', id, name: 'Photo', source: { type: 'field', field: 'imageUrl' }, fit: 'cover', focal: { x: 0.5, y: 0.35 }, treatment: 'none', scrim: true, position: { mode: 'absolute', top: 0, left: 0, width: 1, height: 1 } };
    case 'rows':
      return { kind: 'rows', id, name: 'Table', source: { type: 'field', field: 'rows' }, density: 'auto', columns: ['rank', 'chip', 'primary', 'secondary', 'value', 'trailing'] };
    case 'logo':
      return { kind: 'logo', id, name: 'Logo', variant: 'auto' };
    case 'shape':
      return { kind: 'shape', id, name: 'Shape', shape: 'rect', colour: { ref: 'accent' }, width: { mode: 'fixed', px: 120 }, height: { mode: 'fixed', px: 3 } };
  }
}

export const KIND_ICON: Record<NodeKind, string> = {
  frame: '▣', text: 'T', image: '▧', rows: '▤', logo: '◈', shape: '▬',
};
