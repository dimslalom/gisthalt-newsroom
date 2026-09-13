/**
 * The live, per-node contrast scanner for document-backed layouts.
 *
 * assertContrast() (contrast.ts) already checks a fixed set of token pairs —
 * headline-on-bg, muted-on-panel, and so on — resolved once per skin. That
 * stays exactly as it was. This scanner exists for what it cannot see: a
 * document node whose colour is a raw literal or a palette reference has no
 * seat in that fixed pair list, so a `#EF4444` label on a `#E85D3F` backplate
 * would sail through assertContrast() unnoticed.
 *
 * This walks every visible text node, resolves its real foreground colour and
 * its real backdrop, and measures the actual ratio — live, in the editor, as
 * a warning. Only certification (renderDocHtml's `certify` option) turns a
 * failing finding into a hard error; day-to-day editing never blocks on this.
 */

import { findParent, walk, type FrameNode, type LayoutDoc, type LayoutNode, type TextNode } from '../doc.ts';
import { buildPaintContext, resolveColour, resolvePaint, type PaintContext } from '../paint.ts';
import { contrastRatio, parseHex } from './contrast.ts';
import type { CompositionSpec } from '../types.ts';

export interface ContrastFinding {
  nodeId: string;
  nodeName: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
  pass: boolean;
  backdrop: 'canvas' | 'frame' | 'photo' | 'unknown';
}

function isOpaqueSolid(node: LayoutNode, paint: PaintContext): string | null {
  if (!node.background || node.background.type === 'none') return null;
  if (node.background.opacity !== undefined && node.background.opacity < 0.98) return null;
  const resolved = resolvePaint(node.background, paint);
  // A gradient resolves to a `linear-gradient(...)` / `radial-gradient(...)`
  // CSS function, not a colour — parseHex rejects it, which is the correct
  // "can't reason about this backdrop" outcome, not a crash.
  return tryHex(resolved);
}

function tryHex(v: string): string | null {
  try { parseHex(v); return v; } catch { return null; }
}

/** True when an absolutely-positioned image node fully covers the canvas and
 *  carries the automatic scrim — the one case a document reliably darkens (or
 *  lightens) an unknown photo for legibility. */
function hasCoveringPhoto(root: FrameNode): boolean {
  let found = false;
  walk(root, (n) => {
    if (n.kind !== 'image' || n.hidden) return;
    const p = n.position;
    if (p?.mode === 'absolute' && (p.top ?? 0) <= 0.02 && (p.left ?? 0) <= 0.02 && (p.width ?? 1) >= 0.98 && (p.height ?? 1) >= 0.98 && n.scrim !== false) {
      found = true;
    }
  });
  return found;
}

/**
 * Backdrop resolution per visible text node: the nearest ancestor with an
 * opaque background wins; failing that, a full-bleed scrimmed photo behind it
 * (approximated by the render-time guard's own recommended treatment colour,
 * since the actual photo's luminance is only known once real image bytes are
 * measured — see packages/render/src/render.ts's pickTextTreatment); failing
 * that, the canvas background. Anything unparseable is 'unknown' and passes —
 * warn, never block on a colour this scanner cannot reason about.
 */
function backdropFor(node: TextNode, root: FrameNode, spec: CompositionSpec, paint: PaintContext): { hex: string | null; kind: ContrastFinding['backdrop'] } {
  let cursor: FrameNode | null = findParent(root, node.id);
  while (cursor) {
    const hex = isOpaqueSolid(cursor, paint);
    if (hex) return { hex, kind: 'frame' };
    cursor = findParent(root, cursor.id);
  }
  if (hasCoveringPhoto(root)) {
    const proxy = spec.textTreatment?.colour ?? null;
    return { hex: proxy ? tryHex(proxy) : null, kind: 'photo' };
  }
  return { hex: tryHex(paint.tokenHex.bg ?? ''), kind: 'canvas' };
}

export function scanContrast(doc: LayoutDoc, spec: CompositionSpec, vars: Record<string, string>): ContrastFinding[] {
  const paint = buildPaintContext(doc, spec, vars);
  const findings: ContrastFinding[] = [];
  walk(doc.root, (node) => {
    if (node.kind !== 'text' || node.hidden) return;
    const fgHex = tryHex(resolveColour(node.colour ?? { ref: 'fg' }, paint));
    const { hex: bgHex, kind } = backdropFor(node, doc.root, spec, paint);
    if (!fgHex || !bgHex) {
      findings.push({ nodeId: node.id, nodeName: node.name, fg: fgHex ?? '', bg: bgHex ?? '', ratio: 0, required: 4.5, pass: true, backdrop: 'unknown' });
      return;
    }
    const large = node.step === 'mega' || node.step === 'hero' || node.step === 'h1' || node.step === 'h2';
    const required = large ? 3 : 4.5;
    const ratio = contrastRatio(fgHex, bgHex);
    findings.push({ nodeId: node.id, nodeName: node.name, fg: fgHex, bg: bgHex, ratio, required, pass: ratio >= required, backdrop: kind });
  });
  return findings;
}
