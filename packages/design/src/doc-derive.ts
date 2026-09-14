import { findNode, mapTree, type FrameNode, type LayoutDoc, type LayoutNode, type TextNode } from './doc.ts';

/**
 * Deriving a sibling layout from a hand-designed master — mechanical
 * transforms a designer reviews and accepts, never a silent auto-generation.
 * Each transform is a pure `LayoutDoc -> LayoutDoc` function; `deriveLayout`
 * just applies a chosen sequence and hands back a document exactly as
 * editable as one built by hand.
 */

export type DeriveTransform =
  | { type: 'mirror' }
  | { type: 'photoTo'; position: PhotoPosition }
  | { type: 'bodyTo'; justify?: FrameNode['justify']; align?: FrameNode['align']; textAlign?: TextNode['align'] }
  | { type: 'promote'; nodeId: string; step: TextNode['step'] };

export type PhotoPosition = 'left' | 'right' | 'top' | 'full';
export const PHOTO_POSITIONS: PhotoPosition[] = ['left', 'right', 'top', 'full'];

function mirrorNode(node: LayoutNode): LayoutNode {
  let out: LayoutNode = node;
  if (node.position?.mode === 'absolute') {
    const { left, right, ...rest } = node.position;
    out = {
      ...out,
      position: {
        ...rest, mode: 'absolute',
        ...(left !== undefined ? { right: left } : {}),
        ...(right !== undefined ? { left: right } : {}),
      },
    };
  }
  if (out.kind === 'frame' && out.axis === 'horizontal') {
    out = {
      ...out,
      children: [...out.children].reverse(),
      align: out.align === 'start' ? 'end' : out.align === 'end' ? 'start' : out.align,
    };
  }
  if (out.kind === 'text' && out.align) {
    out = { ...out, align: out.align === 'left' ? 'right' : out.align === 'right' ? 'left' : out.align };
  }
  return out;
}

/** Swaps left↔right throughout: absolute insets, horizontal-frame child
 *  order and alignment, and text alignment. Involutive by construction — a
 *  clean field swap either direction, never a one-way move — so mirroring
 *  twice always returns exactly the original tree. */
export function mirror(doc: LayoutDoc): LayoutDoc {
  return { ...doc, root: mapTree(doc.root, mirrorNode) as FrameNode };
}

function findByName(root: LayoutNode, name: string): LayoutNode | null {
  if (root.name === name) return root;
  if (root.kind !== 'frame') return null;
  for (const c of root.children) { const hit = findByName(c, name); if (hit) return hit; }
  return null;
}

const PHOTO_POSITION_VALUES: Record<PhotoPosition, NonNullable<LayoutNode['position']>> = {
  left: { mode: 'absolute', top: 0, left: 0, width: 0.52, height: 1 },
  right: { mode: 'absolute', top: 0, right: 0, width: 0.52, height: 1 },
  top: { mode: 'absolute', top: 0, left: 0, width: 1, height: 0.385 },
  full: { mode: 'absolute', top: 0, left: 0, width: 1, height: 1 },
};

/** Repositions the node named "Photo" — the mechanical half of turning e.g.
 *  a full-bleed layout into a portrait or split one. A no-op (returns the
 *  document unchanged) when there's no photo to move — never a crash. */
export function photoTo(doc: LayoutDoc, position: PhotoPosition): LayoutDoc {
  const photo = findByName(doc.root, 'Photo');
  if (!photo) return doc;
  const pos = PHOTO_POSITION_VALUES[position];
  return { ...doc, root: mapTree(doc.root, (n) => (n.id === photo.id ? { ...n, position: pos } : n)) as FrameNode };
}

/** Reflows the frame named "Body" and every text node inside it together —
 *  the two nearly always change in lockstep when a layout's photo moves.
 *  Text outside Body (eyebrow, footnote) keeps its own alignment. */
export function bodyTo(doc: LayoutDoc, opts: { justify?: FrameNode['justify']; align?: FrameNode['align']; textAlign?: TextNode['align'] }): LayoutDoc {
  const body = findByName(doc.root, 'Body');
  if (!body) return doc;
  let subtree: LayoutNode = body;
  if (subtree.kind === 'frame') {
    subtree = {
      ...subtree,
      ...(opts.justify ? { justify: opts.justify } : {}),
      ...(opts.align ? { align: opts.align } : {}),
    };
    if (opts.textAlign) subtree = mapTree(subtree, (n) => (n.kind === 'text' ? { ...n, align: opts.textAlign! } : n));
  }
  return { ...doc, root: mapTree(doc.root, (n) => (n.id === body.id ? subtree : n)) as FrameNode };
}

/** Bumps one text node to a different size step — e.g. promoting the
 *  headline when a derived layout has more room to work with. */
export function promote(doc: LayoutDoc, nodeId: string, step: TextNode['step']): LayoutDoc {
  const target = findNode(doc.root, nodeId);
  if (!target || target.kind !== 'text') return doc;
  return { ...doc, root: mapTree(doc.root, (n) => (n.id === nodeId ? { ...n, step } : n)) as FrameNode };
}

export function deriveLayout(doc: LayoutDoc, transforms: DeriveTransform[]): LayoutDoc {
  return transforms.reduce((acc, t) => {
    if (t.type === 'mirror') return mirror(acc);
    if (t.type === 'photoTo') return photoTo(acc, t.position);
    if (t.type === 'bodyTo') return bodyTo(acc, t);
    return promote(acc, t.nodeId, t.step);
  }, doc);
}

/** A starting guess at which transforms turn one built-in layout into
 *  another — a proposal to review, never applied silently. `[]` when there's
 *  no obvious recipe; the designer builds one by hand from the transforms. */
export function suggestTransforms(fromLayout: string, toLayout: string): DeriveTransform[] {
  const mirrorPairs: Record<string, string> = { 'hero-left': 'hero-right', 'hero-right': 'hero-left' };
  return mirrorPairs[fromLayout] === toLayout ? [{ type: 'mirror' }] : [];
}
