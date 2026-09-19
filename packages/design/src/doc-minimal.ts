/**
 * The house style every layout is generated from, instead of being designed
 * one by one:
 *
 * - the claim's photo fills the whole canvas, untreated and unscrimmed;
 * - text appears only inside one black, rounded box, always in white;
 * - the box carries only the content that matters — big number, quote,
 *   headline, table. No eyebrow, footnote, logo, rules, chips or accents.
 *
 * Layout slots differ only in where that box sits, so the composer still has
 * distinct-looking positions to rotate through.
 */

import { DEFAULT_CANVAS, type FrameNode, type LayoutDoc, type LayoutNode, type TextNode } from './doc.ts';
import type { Colour } from './paint.ts';
import type { LayoutKey } from './types.ts';

const BLACK: Colour = { hex: '#000000' };
const WHITE: Colour = { hex: '#ffffff' };
const BOX_RADIUS = 28;

interface Placement {
  /** Vertical position of the box on the canvas. */
  justify: FrameNode['justify'];
  /** Horizontal position; `stretch` makes the box full width. */
  align: FrameNode['align'];
  textAlign: TextNode['align'];
}

const PLACEMENTS: Record<string, Placement> = {
  'hero-left': { justify: 'end', align: 'start', textAlign: 'left' },
  'hero-right': { justify: 'end', align: 'end', textAlign: 'right' },
  'full-bleed': { justify: 'end', align: 'stretch', textAlign: 'left' },
  framed: { justify: 'center', align: 'center', textAlign: 'center' },
  split: { justify: 'start', align: 'start', textAlign: 'left' },
  stacked: { justify: 'start', align: 'stretch', textAlign: 'left' },
  'big-number': { justify: 'end', align: 'start', textAlign: 'left' },
  portrait: { justify: 'center', align: 'start', textAlign: 'left' },
};

const DEFAULT_PLACEMENT: Placement = PLACEMENTS['hero-left']!;

export function minimalDoc(layout: LayoutKey, name: string = layout): LayoutDoc {
  const p = layout;
  const place = PLACEMENTS[layout] ?? DEFAULT_PLACEMENT;
  const ta = place.textAlign;
  const text = (id: string, props: Omit<TextNode, 'kind' | 'id' | 'colour' | 'align'>): TextNode => ({
    kind: 'text', id: `${p}-${id}`, colour: WHITE, align: ta, ...props,
  });

  const content: LayoutNode[] = [
    text('bignum', { name: 'Big number', source: { type: 'field', field: 'bigNumber' }, font: { token: 'display' }, step: { px: 150 }, lineHeight: 0.9, weight: 700 }),
    text('quote', { name: 'Quote', source: { type: 'field', field: 'quote' }, font: { token: 'display' }, step: 'h2', weight: 600, maxLines: 6 }),
    text('headline', {
      name: 'Headline', source: { type: 'field', field: 'headline' }, font: { token: 'display' }, weight: 700,
      step: 'fit', fit: { minPx: 34, maxPx: 84, lines: 4 },
    }),
    { kind: 'rows', id: `${p}-rows`, name: 'Table', source: { type: 'field', field: 'rows' }, density: 'auto', columns: ['rank', 'primary', 'value'], plain: true },
  ];

  const box: FrameNode = {
    kind: 'frame', id: `${p}-body`, name: 'Body', axis: 'vertical', gap: 2,
    align: 'stretch', justify: 'start',
    ...(place.align === 'stretch' ? {} : { width: { mode: 'hug' } }),
    background: { type: 'solid', colour: BLACK },
    radius: BOX_RADIUS,
    padding: { top: 4.5, right: 5, bottom: 4.5, left: 5 },
    children: content,
  };

  return {
    version: 1, id: p, name, canvas: DEFAULT_CANVAS,
    root: {
      kind: 'frame', id: `${p}-root`, name: 'Canvas', axis: 'vertical', gap: 0,
      align: place.align, justify: place.justify,
      padding: { top: 7, right: 7, bottom: 7, left: 7 },
      background: { type: 'solid', colour: { ref: 'bg' } },
      children: [
        {
          kind: 'image', id: `${p}-photo`, name: 'Photo', source: { type: 'field', field: 'imageUrl' },
          fit: 'cover', focal: { x: 0.5, y: 0.35 }, treatment: 'none', scrim: false,
          position: { mode: 'absolute', top: 0, left: 0, width: 1, height: 1 },
        },
        box,
      ],
    },
  };
}
