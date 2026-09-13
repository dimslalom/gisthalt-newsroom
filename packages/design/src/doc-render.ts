/**
 * The interpreter. Walks a LayoutDoc and emits one self-contained HTML
 * document, the same contract renderArtHtml has always had.
 *
 * Everything structural is flexbox, because flexbox *is* Figma's auto layout:
 * a stack with a direction, a gap, padding, and per-child hug/fill/fixed
 * sizing. Mapping the document's intent onto it directly — rather than onto
 * absolute coordinates — is what makes one document survive both a headline
 * nobody has read and a canvas it wasn't authored at.
 *
 * Colour and type never appear here as literals. A node names a token role and
 * this file emits `var(--fg)` / `var(--fs-h1)`, so resolveColours() stays the
 * single authority on what those mean for this skin and entity, and the
 * contrast guard keeps working exactly as it did.
 */

import { assertContrast, ContrastError } from './guards/contrast.ts';
import { scanContrast } from './guards/contrast-scan.ts';
import { resolveColours } from './template.ts';
import { CANVASES, type CanvasKey, type FrameNode, type ImageNode, type LayoutDoc, type LayoutNode, type RowsNode, type ShapeNode, type Size, type TextNode } from './doc.ts';
import { resolveColour, resolvePaint, buildPaintContext, type PaintContext } from './paint.ts';
import { resolveText } from './fields.ts';
import type { CompositionSpec, TableRow } from './types.ts';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Line height is a property of the type step, not a per-node decision — a
 *  display step set at body leading looks broken no matter who chose it. */
const LEADING: Record<string, number> = {
  mega: 0.8, hero: 0.92, h1: 0.95, h2: 1.06, body: 1.25, lab: 1.2, fine: 1.3, fit: 0.95,
};

function sizeCss(size: Size | undefined, axisIsMain: boolean, prop: 'width' | 'height'): string {
  // An unset axis emits nothing, so the parent's align-items decides. Defaulting
  // to hug here would silently override align:stretch and collapse every child
  // to its own text width — which is exactly what a stack is meant to prevent.
  if (!size) return '';
  const mode = size.mode;
  if (mode === 'fixed') {
    const px = `${size.px ?? 100}px`;
    return axisIsMain ? `flex:0 0 ${px};${prop}:${px}` : `${prop}:${px}`;
  }
  if (mode === 'fill') {
    // On the main axis "fill" means absorb free space; on the cross axis it
    // means stretch to the parent's measure. Same word, two flex mechanisms.
    return axisIsMain ? 'flex:1 1 0;min-height:0;min-width:0' : 'align-self:stretch';
  }
  return axisIsMain ? 'flex:0 0 auto' : `${prop}:fit-content;max-${prop}:100%`;
}

const ALIGN_CSS: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY_CSS: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };

function baseStyle(node: LayoutNode, parentAxis: 'vertical' | 'horizontal', ctx: Ctx): string {
  const out: string[] = [];
  const pos = node.position;
  if (pos?.mode === 'absolute') {
    // Insets are canvas fractions, emitted as percentages so the same document
    // lands proportionally at every aspect ratio instead of drifting off-frame.
    out.push('position:absolute');
    const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
    for (const k of ['top', 'right', 'bottom', 'left', 'width', 'height'] as const) {
      const v = pos[k];
      if (typeof v === 'number') out.push(`${k}:${pct(v)}`);
    }
    if (pos.top === undefined && pos.bottom === undefined) out.push('top:0');
    if (pos.left === undefined && pos.right === undefined) out.push('left:0');
  } else {
    const mainIsVertical = parentAxis === 'vertical';
    out.push(sizeCss(node.height, mainIsVertical, 'height'));
    out.push(sizeCss(node.width, !mainIsVertical, 'width'));
  }
  if (node.opacity !== undefined && node.opacity < 1) out.push(`opacity:${node.opacity}`);
  if (node.background && node.background.type !== 'none') out.push(`background:${resolvePaint(node.background, ctx.paint)}`);
  if (node.padding) out.push(paddingCss(node.padding));
  return out.filter(Boolean).join(';');
}

function frameHtml(node: FrameNode, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  const s = [
    baseStyle(node, parentAxis, ctx),
    'display:flex',
    `flex-direction:${node.axis === 'horizontal' ? 'row' : 'column'}`,
    node.gap ? `gap:calc(var(--u)*${node.gap})` : '',
    `align-items:${ALIGN_CSS[node.align ?? 'stretch']}`,
    `justify-content:${JUSTIFY_CSS[node.justify ?? 'start']}`,
    node.position?.mode === 'absolute' ? '' : 'position:relative',
  ].filter(Boolean).join(';');

  const kids = node.children.map((c) => nodeHtml(c, ctx, node.axis)).filter(Boolean).join('\n');
  // A frame whose every child resolved to nothing would otherwise render as a
  // padded empty box, which reads as a layout bug rather than absent data.
  const paints = (node.background && node.background.type !== 'none') || node.height?.mode === 'fixed';
  if (!kids.trim() && !paints) return '';
  return `<div data-el="${esc(node.id)}" data-kind="frame" style="${s}">${kids}</div>`;
}

function paddingCss(p: NonNullable<LayoutNode['padding']>): string {
  const v = (n?: number) => (n ? `calc(var(--u)*${n})` : '0');
  return `padding:${v(p.top)} ${v(p.right)} ${v(p.bottom)} ${v(p.left)}`;
}

/** A named step's resolved leading, or a literal one on a raw-px node. */
function leadingFor(node: TextNode): number {
  if (node.lineHeight !== undefined) return node.lineHeight;
  const step = node.step;
  return typeof step === 'string' ? (LEADING[step] ?? 1.25) : 1.2;
}

function fontFamilyCss(font: TextNode['font']): string {
  if (!font) return 'var(--font-body)';
  return 'family' in font ? `"${font.family.replace(/"/g, '')}", var(--font-body)` : `var(--font-${font.token})`;
}

function fontSizeCss(step: TextNode['step']): string {
  if (!step || step === 'fit') return '';
  return typeof step === 'string' ? `font-size:var(--fs-${step})` : `font-size:${step.px}px`;
}

function textHtml(node: TextNode, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  const value = resolveText(node.source, ctx.spec.model, ctx.spec.brand);
  if (value === null) return ''; // auto-hide: the stack closes its own gap
  const isFit = node.step === 'fit';
  const namedStep = typeof node.step === 'string' ? node.step : undefined;
  const s = [
    baseStyle(node, parentAxis, ctx),
    `font-family:${fontFamilyCss(node.font)}`,
    fontSizeCss(node.step),
    `line-height:${leadingFor(node)}`,
    `color:${resolveColour(node.colour ?? { ref: 'fg' }, ctx.paint)}`,
    `text-align:${node.align ?? 'left'}`,
    node.transform === 'uppercase' ? 'text-transform:uppercase' : node.transform === 'lowercase' ? 'text-transform:lowercase' : '',
    `font-weight:${node.weight ?? 400}`,
    node.italic ? 'font-style:italic' : '',
    namedStep === 'lab' ? 'letter-spacing:var(--ls-lab)' : '',
    namedStep === 'mega' || namedStep === 'hero' || namedStep === 'h1' || isFit ? 'letter-spacing:var(--ls-disp)' : '',
    // A node's own explicit letter-spacing wins: it's emitted last, and later
    // declarations in the same inline style attribute take precedence.
    node.letterSpacing ? `letter-spacing:${node.letterSpacing}` : '',
    node.maxLines && !isFit
      ? `display:-webkit-box;-webkit-line-clamp:${node.maxLines};-webkit-box-orient:vertical;overflow:hidden`
      : '',
  ].filter(Boolean).join(';');

  // fitText owns the size for `fit` nodes: the browser's own measurement is the
  // only measurement that counts, and it runs before the screenshot is taken.
  const fitAttrs = isFit
    ? ` data-fit="${ctx.noFit ? '' : '1'}" data-fit-min="${node.fit?.minPx ?? 34}" data-fit-max="${node.fit?.maxPx ?? 118}" data-fit-lines="${node.fit?.lines ?? 3}"`
    : '';
  return `<div data-el="${esc(node.id)}" data-kind="text"${fitAttrs} style="${s}">${esc(value)}</div>`;
}

function imageHtml(node: ImageNode, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  if (!ctx.imageSrc || ctx.spec.skin.imagery === 'none') return '';
  const s = [
    baseStyle(node, parentAxis, ctx),
    'overflow:hidden',
    'background:var(--panel)',
    node.position?.mode === 'absolute' ? '' : 'position:relative',
  ].filter(Boolean).join(';');
  const filter = node.treatment === 'grayscale' || node.treatment === 'duotone' ? 'filter:grayscale(1) contrast(1.15);' : '';
  const focal = `object-position:${((node.focal?.x ?? 0.5) * 100).toFixed(0)}% ${((node.focal?.y ?? 0.35) * 100).toFixed(0)}%`;
  const duo = node.treatment === 'duotone'
    ? '<i style="position:absolute;inset:0;background:var(--accent);mix-blend-mode:color;opacity:.55"></i>'
    : '';
  const scrim = node.scrim !== false
    ? `<i style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.72) 0%,rgba(0,0,0,.35) 9%,rgba(0,0,0,0) 18%),linear-gradient(to top,rgba(0,0,0,calc(var(--scrim) + .25)) 0%,rgba(0,0,0,var(--scrim)) 45%,rgba(0,0,0,0) 85%)"></i>`
    : '';
  return `<div data-el="${esc(node.id)}" data-kind="image" style="${s}">`
    + `<img src="${esc(ctx.imageSrc)}" alt="" style="width:100%;height:100%;object-fit:${node.fit ?? 'cover'};${focal};display:block;${filter}">`
    + `${duo}${scrim}</div>`;
}

function rowsNodeHtml(node: RowsNode, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  const rows = ctx.spec.model.rows;
  if (!rows?.length) return '';
  const cols = node.columns ?? ['rank', 'chip', 'primary', 'secondary', 'value', 'trailing'];
  const density = node.density && node.density !== 'auto'
    ? node.density
    : rows.length >= 14 ? 'dense' : rows.length <= 5 ? 'roomy' : '';
  const cell = (r: TableRow, c: string): string => {
    switch (c) {
      case 'rank': return `<td class="rank">${esc(r.rank)}</td>`;
      case 'chip': return '<td class="chip"><i></i></td>';
      case 'primary': return `<td class="primary">${esc(r.primary)}</td>`;
      case 'secondary': return `<td class="secondary">${esc(r.secondary ?? '')}</td>`;
      case 'value': return `<td class="value">${esc(r.value)}</td>`;
      case 'trailing': return `<td class="trailing">${esc(r.trailing ?? '')}</td>`;
      default: return '';
    }
  };
  const body = rows.map((r) =>
    `<tr${r.colour ? ` style="--row-colour:${esc(r.colour)}"` : ''}>${cols.map((c) => cell(r, c)).join('')}</tr>`).join('');
  return `<div data-el="${esc(node.id)}" data-kind="rows" style="${baseStyle(node, parentAxis, ctx)}">`
    + `<table class="rows ${density}"><tbody>${body}</tbody></table></div>`;
}

function logoHtml(node: LayoutNode & { kind: 'logo' }, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  const t = ctx.spec.brand.tokens;
  const variant = node.variant ?? 'auto';
  const useSvg = (variant === 'auto' || variant === 'svg') && Boolean(t.logo.svgMarkup);
  const s = baseStyle(node, parentAxis, ctx);
  if (useSvg) {
    return `<div data-el="${esc(node.id)}" data-kind="logo" class="logo logo-svg" style="${s}">${t.logo.svgMarkup}</div>`;
  }
  const inner = variant === 'mark'
    ? `<span class="mark">${esc(t.logo.mark)}</span>`
    : `<span class="mark">${esc(t.logo.mark)}</span> ${esc(t.logo.text)}`;
  return `<div data-el="${esc(node.id)}" data-kind="logo" class="logo" style="${s}">${inner}</div>`;
}

function shapeHtml(node: ShapeNode, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  const thickness = node.thickness ?? 3;
  const s = [
    baseStyle(node, parentAxis, ctx),
    `background:${resolveColour(node.colour ?? { ref: 'accent' }, ctx.paint)}`,
    node.shape === 'line' ? `height:${thickness}px;flex:0 0 ${thickness}px` : '',
  ].filter(Boolean).join(';');
  return `<div data-el="${esc(node.id)}" data-kind="shape" style="${s}"></div>`;
}

interface Ctx { spec: CompositionSpec; imageSrc: string | null; noFit: boolean; paint: PaintContext }

function nodeHtml(node: LayoutNode, ctx: Ctx, parentAxis: 'vertical' | 'horizontal'): string {
  if (node.hidden) return '';
  switch (node.kind) {
    case 'frame': return frameHtml(node, ctx, parentAxis);
    case 'text': return textHtml(node, ctx, parentAxis);
    case 'image': return imageHtml(node, ctx, parentAxis);
    case 'rows': return rowsNodeHtml(node, ctx, parentAxis);
    case 'logo': return logoHtml(node, ctx, parentAxis);
    case 'shape': return shapeHtml(node, ctx, parentAxis);
  }
}

/** The table styling is the one place real CSS still beats inline styles —
 *  it targets generated `<td>`s the document never names directly. */
const DOC_CSS = String.raw`
*{box-sizing:border-box;margin:0;padding:0}
.docart{position:relative;overflow:hidden;background:var(--bg);color:var(--fg);isolation:isolate}
.logo{font-family:var(--font-display);font-weight:700;font-size:var(--fs-lab);letter-spacing:.18em;
      text-transform:uppercase;color:var(--fg);line-height:1}
.logo .mark{color:var(--accent-text)}
.logo-svg{width:calc(var(--fs-lab)*1.9);height:calc(var(--fs-lab)*1.9);line-height:0}
.logo-svg svg{width:100%;height:100%;display:block}
table.rows{width:100%;border-collapse:collapse;font-size:var(--fs-body)}
table.rows td{padding:calc(var(--u)*1.25) 0;border-bottom:1px solid var(--line);vertical-align:middle}
table.rows tr:last-child td{border-bottom:0}
td.rank{width:72px;font-family:var(--font-mono);color:var(--muted);font-variant-numeric:tabular-nums}
td.chip{width:14px;padding-right:calc(var(--u)*1.5)}
td.chip i{display:block;width:8px;height:34px;background:var(--row-colour,var(--accent))}
td.primary{font-family:var(--font-display);font-weight:600;letter-spacing:-.005em;white-space:nowrap;
           overflow:hidden;text-overflow:ellipsis;max-width:420px}
td.secondary{color:var(--muted);font-size:var(--fs-fine);text-transform:uppercase;letter-spacing:.08em;
             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
td.value{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.trailing{text-align:right;font-family:var(--font-mono);color:var(--muted);font-size:var(--fs-fine);
            font-variant-numeric:tabular-nums;white-space:nowrap;width:150px}
.rows.dense td{padding:calc(var(--u)*.6) 0;font-size:calc(var(--fs-body)*.78)}
.rows.dense td.chip i{height:22px}
.rows.roomy td{padding:calc(var(--u)*2.4) 0}

/* accents (L5) ------------------------------------------------------------
   Decorative overlays chosen by the composer's shuffle bag, not by the
   document. They sit above the content layer and below nothing, exactly as in
   the template path — a document describes structure; accents are one of the
   axes that turn one structure into many distinct-looking posts. */
/* Content sits above accents, photos below them — the same z-order the
   template path establishes with .bed(0) / .acc(2) / .layer(3). */
.docart > *{z-index:3}
.docart > [data-kind="image"]{z-index:0}
.acc{position:absolute;inset:0;z-index:2;pointer-events:none}
.acc-diagonal{clip-path:polygon(0 62%,100% 40%,100% 100%,0 100%);background:var(--bg);opacity:.94}
.acc-halftone{background-image:radial-gradient(var(--accent) 1.4px,transparent 1.5px);background-size:14px 14px;opacity:.16;
              mask-image:linear-gradient(to bottom,transparent 40%,black 100%)}
.acc-grain{opacity:.10;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>");
            mix-blend-mode:overlay}
.acc-ticker{top:auto;height:46px;bottom:0;background:var(--accent);color:var(--on-accent);
            display:flex;align-items:center;gap:36px;padding:0 24px;overflow:hidden;white-space:nowrap;
            font-family:var(--font-mono);font-size:16px;letter-spacing:.22em;text-transform:uppercase}
.acc-watermark{display:flex;align-items:flex-start;justify-content:flex-end;overflow:hidden}
.acc-watermark span{font-family:var(--font-display);font-weight:700;font-size:440px;line-height:.72;
                    color:var(--fg);opacity:.055;transform:translate(14%,-8%)}
.acc-cropmarks::before,.acc-cropmarks::after{content:"";position:absolute;width:44px;height:44px;border:2px solid var(--accent);opacity:.7}
.acc-cropmarks::before{top:22px;left:22px;border-right:0;border-bottom:0}
.acc-cropmarks::after{bottom:22px;right:22px;border-left:0;border-top:0}
`;

/** The accent overlays, identical in behaviour to the template path's. The
 *  ticker eats 46px off the bottom, so the root reserves it — otherwise the
 *  footnote sits underneath a solid bar. */
function accentsHtml(spec: CompositionSpec): string {
  return spec.accents.map((a) => {
    if (a === 'ticker') {
      const items = [spec.model.eyebrow, spec.model.footnote, spec.brand.name].filter(Boolean);
      return `<div class="acc acc-ticker">${items.map((i) => `<span>${esc(i)}</span>`).join('')}</div>`;
    }
    if (a === 'watermark') {
      const word = (spec.model.bigNumber ?? spec.model.eyebrow.split(' ')[0] ?? spec.brand.tokens.logo.mark).slice(0, 3);
      return `<div class="acc acc-watermark"><span>${esc(word)}</span></div>`;
    }
    return `<div class="acc acc-${esc(a)}"></div>`;
  }).join('');
}

/**
 * The document path's own fitText.
 *
 * The template path measures a headline against its parent's box, which works
 * because that parent is always the fixed-height `.body` grid area. In a
 * document, the parent is whatever frame the designer dropped the text into —
 * and a hug-sized frame's height *is* the text's height, so measuring against
 * it is circular: the box grows to fit whatever size is being tested and every
 * size passes.
 *
 * So this measures against the card instead: how much room is left between the
 * element's own top and the bottom of the canvas, which is the constraint that
 * actually matters (don't run off the card), combined with the line cap. Both
 * are true regardless of how the designer nested things.
 */
const DOC_FIT_SCRIPT = `<script>
(function(){
  var art = document.querySelector('.docart');
  function fit(el){
    var min = +el.dataset.fitMin || 28, max = +el.dataset.fitMax || 120, lines = +el.dataset.fitLines || 3;
    var artBox = art.getBoundingClientRect();
    function avail(){
      var r = el.getBoundingClientRect();
      // Room from this element's top to the card's bottom edge, less whatever
      // padding its own chain of ancestors reserves below it.
      return Math.max(60, artBox.bottom - r.top);
    }
    function ok(px){
      el.style.fontSize = px + 'px';
      var lh = parseFloat(getComputedStyle(el).lineHeight) || px;
      var lineCount = Math.round(el.scrollHeight / lh);
      return el.scrollHeight <= avail() && lineCount <= lines && el.scrollWidth <= el.clientWidth + 1;
    }
    var lo = min, hi = max, best = -1;
    for (var i = 0; i < 12 && lo <= hi; i++){
      var mid = Math.floor((lo + hi) / 2);
      if (ok(mid)) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (best < 0){
      el.style.fontSize = min + 'px';
      el.dataset.overflow = '1';
      el.style.display = '-webkit-box';
      el.style.webkitLineClamp = String(lines);
      el.style.webkitBoxOrient = 'vertical';
      el.style.overflow = 'hidden';
    } else {
      el.style.fontSize = best + 'px';
    }
    el.dataset.fitted = el.style.fontSize;
  }
  document.querySelectorAll('[data-fit="1"]').forEach(fit);
  window.__fitDone = true;
})();
</script>`;

export interface DocRenderOptions {
  fontsCss?: string;
  imageSrc?: string | null;
  noFit?: boolean;
  /** Render at a canvas other than the one the document was authored at. */
  canvas?: CanvasKey;
  /** Hard-fail on any failing contrast finding, the same contract
   *  assertContrast() already has for the token-only pairs. Off by default —
   *  a document being actively edited should warn, not throw; only
   *  certification (scripts/render-goldens.ts) sets this. */
  certify?: boolean;
}

export function renderDocHtml(doc: LayoutDoc, spec: CompositionSpec, opts: DocRenderOptions = {}): string {
  const { vars, pairs } = resolveColours(spec);
  assertContrast(pairs); // unchanged contract: fail the render, never ship unreadable

  const t = spec.brand.tokens;
  const canvasKey = opts.canvas ?? doc.canvas;
  const canvas = CANVASES[canvasKey] ?? CANVASES['portrait-4x5'];

  const tokenVars = {
    '--fs-mega': `${t.fs.mega}px`, '--fs-hero': `${t.fs.hero}px`, '--fs-h1': `${t.fs.h1}px`,
    '--fs-h2': `${t.fs.h2}px`, '--fs-body': `${t.fs.body}px`, '--fs-lab': `${t.fs.lab}px`,
    '--fs-fine': `${t.fs.fine}px`, '--ls-lab': t.ls.lab, '--ls-disp': t.ls.disp,
    '--pad': `${t.pad}px`, '--stroke': `${t.stroke}px`, '--u': `${t.unit}px`, '--r': `${t.radius}px`,
    '--font-display': t.fonts.display, '--font-body': t.fonts.body, '--font-mono': t.fonts.mono,
    ...vars,
  };
  const rootVars = Object.entries(tokenVars).map(([k, v]) => `${k}:${v}`).join(';');

  if (opts.certify) {
    const findings = scanContrast(doc, spec, vars);
    const failing = findings.filter((f) => !f.pass);
    if (failing.length) {
      throw new ContrastError(failing.map((f) => ({ label: f.nodeName, fg: f.fg, bg: f.bg, ratio: f.ratio, required: f.required })));
    }
  }

  const ctx: Ctx = { spec, imageSrc: opts.imageSrc ?? null, noFit: opts.noFit === true, paint: buildPaintContext(doc, spec, vars) };
  const root = doc.root;
  const rootStyle = [
    `width:${canvas.width}px`, `height:${canvas.height}px`,
    'display:flex',
    `flex-direction:${root.axis === 'horizontal' ? 'row' : 'column'}`,
    root.gap ? `gap:calc(var(--u)*${root.gap})` : '',
    root.padding ? paddingCss(root.padding) : '',
    `align-items:${ALIGN_CSS[root.align ?? 'stretch']}`,
    `justify-content:${JUSTIFY_CSS[root.justify ?? 'start']}`,
    // A ticker paints a solid bar across the bottom; reserve its height so the
    // document's own footer never ends up underneath it.
    spec.accents.includes('ticker') ? 'padding-bottom:calc(var(--u)*8 + 46px)' : '',
    rootVars,
  ].filter(Boolean).join(';');

  const children = root.children.map((c) => nodeHtml(c, ctx, root.axis)).filter(Boolean).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${opts.fontsCss ?? ''}
${DOC_CSS}
</style></head><body style="margin:0;background:#202428">
<div class="art docart" data-el="${esc(root.id)}" data-kind="frame" style="${rootStyle}">
${children}
${accentsHtml(spec)}
</div>
${opts.noFit ? '' : DOC_FIT_SCRIPT}
</body></html>`;
}
