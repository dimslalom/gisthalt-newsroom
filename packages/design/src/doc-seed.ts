/**
 * The eight built-in layouts, re-expressed as documents.
 *
 * These exist so the editor never opens on a blank canvas. Every one of them
 * is the CSS layout it is named after, rebuilt out of frames and stacks — so
 * the first thing you do is change a design that already works, and so the
 * format has to be provably expressive enough to say everything the hardcoded
 * templates said. Anywhere the document version can't reach what the CSS did,
 * that's a gap in the format, and it should be fixed here rather than papered
 * over in the editor.
 *
 * IDs are deterministic, not random: regenerating a seed produces the same
 * tree, so `layouts.json` stays diffable and a re-seed doesn't look like a
 * rewrite of every node.
 */

import { DEFAULT_CANVAS, type FontFamily, type FontSpec, type FrameNode, type LayoutDoc, type LayoutNode, type TextNode } from './doc.ts';
import type { Colour, Paint } from './paint.ts';
import type { BuiltinLayoutKey, LayoutKey } from './types.ts';

/* --------------------------------------------------------------- builders */

/** Every colour and font in this file names a brand token role — the same
 *  shorthand the CSS template used — so these three helpers are the only
 *  place a bare role string turns into the open Colour/Paint/FontSpec shape. */
const c = (ref: string): Colour => ({ ref });
const p = (ref: string): Paint => (ref === 'none' ? { type: 'none' } : { type: 'solid', colour: { ref } });
const fam = (token: FontFamily): FontSpec => ({ token });

const frame = (id: string, props: Partial<FrameNode> & { children: LayoutNode[] }): FrameNode => ({
  kind: 'frame', id, name: props.name ?? id, axis: 'vertical', gap: 0,
  align: 'stretch', justify: 'start', background: p('none'), ...props,
});

const text = (id: string, props: Partial<TextNode> & { source: TextNode['source'] }): TextNode => ({
  kind: 'text', id, name: props.name ?? id, font: fam('body'), step: 'body',
  colour: c('fg'), align: 'left', transform: 'none', weight: 400, ...props,
});

const bind = (field: string): TextNode['source'] => ({ type: 'field', field });

/** The eyebrow/logo row every layout carries. */
const header = (p: string, reverse = false): FrameNode => frame(`${p}-hdr`, {
  name: 'Header', axis: 'horizontal', justify: 'between', align: 'center', gap: 2,
  height: { mode: 'hug' },
  children: reverse
    ? [{ kind: 'logo', id: `${p}-logo`, name: 'Logo', variant: 'auto' },
       text(`${p}-eyebrow`, { name: 'Eyebrow', source: bind('eyebrow'), step: 'lab', font: fam('mono'), colour: c('accent-text'), transform: 'uppercase', weight: 500, align: 'right' })]
    : [text(`${p}-eyebrow`, { name: 'Eyebrow', source: bind('eyebrow'), step: 'lab', font: fam('mono'), colour: c('accent-text'), transform: 'uppercase', weight: 500 }),
       { kind: 'logo', id: `${p}-logo`, name: 'Logo', variant: 'auto' }],
});

/** Just the footnote. No decorative rule — that reads as a style the brand
 *  isn't going for; add one back per-layout in the editor if a design wants it. */
const footer = (p: string, reverse = false): FrameNode => {
  const kids: LayoutNode[] = [
    text(`${p}-footnote`, { name: 'Footnote', source: bind('footnote'), step: 'fine', font: fam('mono'), colour: c('muted'), transform: 'uppercase' }),
  ];
  const placed = reverse ? kids.reverse() : kids;
  return frame(`${p}-foot`, {
    name: 'Footer', axis: 'horizontal', justify: 'between', align: 'end', gap: 1,
    height: { mode: 'hug' }, children: placed.map((k) => (k.kind === 'text' ? plate(k) : k)),
  });
};

/** The text column. `fit` on the headline is what keeps an unseen claim safe. */
function bodyStack(p: string, opts: {
  justify?: FrameNode['justify']; align?: FrameNode['align']; textAlign?: TextNode['align'];
  headlineMax?: number; headlineStep?: TextNode['step']; withBigNumber?: boolean;
  paddingRight?: number;
}): FrameNode {
  const ta = opts.textAlign ?? 'left';
  const kids: LayoutNode[] = [];
  if (opts.withBigNumber) {
    kids.push(text(`${p}-bignum`, { name: 'Big number', source: bind('bigNumber'), step: 'mega', font: fam('display'), colour: c('accent-text'), weight: 700, align: ta }));
    kids.push(text(`${p}-biglabel`, { name: 'Big number label', source: bind('bigLabel'), step: 'lab', font: fam('mono'), colour: c('muted'), transform: 'uppercase', weight: 500, align: ta }));
  }
  kids.push(text(`${p}-quote`, { name: 'Quote', source: bind('quote'), step: 'h2', font: fam('display'), weight: 600, align: ta }));
  kids.push(text(`${p}-headline`, {
    name: 'Headline', source: bind('headline'), font: fam('display'), weight: 700, align: ta,
    step: opts.headlineStep ?? 'fit',
    ...(opts.headlineStep ? {} : { fit: { minPx: 34, maxPx: opts.headlineMax ?? 118, lines: 3 } }),
  }));
  kids.push(text(`${p}-subhead`, { name: 'Subhead', source: bind('subhead'), step: 'body', colour: c('muted'), align: ta, maxLines: 4 }));
  kids.push(text(`${p}-attrib`, { name: 'Attribution', source: bind('attribution'), step: 'fine', font: fam('mono'), colour: c('muted'), transform: 'uppercase', align: ta }));
  kids.push({ kind: 'rows', id: `${p}-rows`, name: 'Table', source: { type: 'field', field: 'rows' }, density: 'auto', columns: ['rank', 'chip', 'primary', 'secondary', 'value', 'trailing'] });

  return frame(`${p}-body`, {
    name: 'Body', axis: 'vertical', gap: 2.5,
    justify: opts.justify ?? 'end', align: opts.align ?? 'stretch',
    height: { mode: 'fill' },
    ...(opts.paddingRight ? { padding: { right: opts.paddingRight } } : {}),
    // Every text block gets its own plate so it stays legible if this layout
    // ends up carrying a photo. Over a plain background the plate is the same
    // colour as the card and simply doesn't show.
    children: kids.map((k) => (k.kind === 'text' ? plate(k) : k)),
  });
}

const photo = (p: string, pos: NonNullable<LayoutNode['position']>, treatment: 'none' | 'duotone' = 'none'): LayoutNode => ({
  kind: 'image', id: `${p}-photo`, name: 'Photo', source: { type: 'field', field: 'imageUrl' },
  fit: 'cover', focal: { x: 0.5, y: 0.35 }, treatment, scrim: true, position: pos,
});

/** Full-frame photo bed — the default in the CSS template, where `.bed` is
 *  inset:0 for every layout that doesn't explicitly reposition it. */
const fullPhoto = (p: string): LayoutNode => photo(p, { mode: 'absolute', top: 0, left: 0, width: 1, height: 1 });

/**
 * The template does this invisibly: `.art:not(.no-photo) .body > *` paints an
 * opaque backplate behind every text block whenever a photo is present, which
 * is what keeps small text and tables legible over a busy image. A document
 * has to say it out loud — which is better, because now it's visible in the
 * layers panel and a designer can turn it off deliberately instead of
 * wondering why their text has a box around it.
 */
function plate(node: LayoutNode): LayoutNode {
  return { ...node, background: p('bg'), padding: { top: 1, right: 1.5, bottom: 1, left: 1.5 } };
}

const PAD = 8; // spacing units; 8 * the 8px unit token = the 64px pad token

function doc(id: string, name: string, children: LayoutNode[], pad = PAD): LayoutDoc {
  return {
    version: 1, id, name, canvas: DEFAULT_CANVAS,
    root: frame(`${id}-root`, {
      name: 'Canvas', axis: 'vertical', gap: 3, justify: 'between',
      padding: { top: pad, right: pad, bottom: pad, left: pad },
      background: p('bg'), children,
    }),
  };
}

/* ------------------------------------------------------------------ seeds */

export function seedDoc(layout: LayoutKey): LayoutDoc {
  const p = layout;
  switch (layout as BuiltinLayoutKey) {
    case 'hero-left':
      return doc(p, 'Hero left', [fullPhoto(p), header(p), bodyStack(p, { justify: 'end', align: 'start' }), footer(p)]);

    case 'hero-right':
      return doc(p, 'Hero right', [fullPhoto(p), header(p, true), bodyStack(p, { justify: 'end', align: 'end', textAlign: 'right' }), footer(p, true)]);

    case 'full-bleed':
      return doc(p, 'Full bleed', [
        fullPhoto(p),
        header(p), bodyStack(p, { justify: 'end', align: 'start' }), footer(p),
      ], 9);

    case 'framed':
      return doc(p, 'Framed', [
        fullPhoto(p),
        header(p),
        bodyStack(p, { justify: 'center', align: 'center', textAlign: 'center', headlineMax: 68 }),
        footer(p),
      ], 11);

    case 'split':
      return doc(p, 'Split', [
        photo(p, { mode: 'absolute', top: 0, left: 0, width: 1, height: 0.385 }),
        header(p),
        frame(`${p}-spacer`, { name: 'Photo reserve', height: { mode: 'fixed', px: 420 }, children: [] }),
        bodyStack(p, { justify: 'start', align: 'start', headlineMax: 68 }),
        footer(p),
      ]);

    case 'stacked':
      return doc(p, 'Stacked', [
        photo(p, { mode: 'absolute', bottom: 0, left: 0, width: 1, height: 0.318 }),
        header(p),
        bodyStack(p, { justify: 'start', align: 'start', headlineMax: 88 }),
        frame(`${p}-spacer`, { name: 'Photo reserve', height: { mode: 'fixed', px: 360 }, children: [] }),
        footer(p),
      ]);

    case 'big-number':
      return doc(p, 'Big number', [
        fullPhoto(p),
        header(p),
        bodyStack(p, { justify: 'center', align: 'start', withBigNumber: true, headlineStep: 'h2' }),
        footer(p),
      ]);

    case 'portrait':
      return doc(p, 'Portrait', [
        photo(p, { mode: 'absolute', top: 0, right: 0, width: 0.52, height: 1 }),
        frame(`${p}-hdrwrap`, { name: 'Header area', padding: { right: 42 }, height: { mode: 'hug' }, children: [header(p)] }),
        bodyStack(p, { justify: 'end', align: 'start', paddingRight: 42, headlineMax: 68 }),
        footer(p),
      ]);

    // A custom slot (see layout-slots.ts) has no CSS-template fallback and no
    // bespoke recipe of its own — start from the most general-purpose
    // built-in (a full-bleed photo behind a left-aligned text stack) rather
    // than refusing to seed one at all. The designer reshapes it from there.
    default:
      return doc(p, layout, [fullPhoto(p), header(p), bodyStack(p, { justify: 'end', align: 'start' }), footer(p)]);
  }
}
