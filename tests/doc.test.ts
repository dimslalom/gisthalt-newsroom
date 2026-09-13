import { describe, expect, it } from 'vitest';
import {
  sanitizeDoc, sanitizeNode, seedDoc, renderDocHtml, resolveText, applyFormats, presentFields,
  findNode, removeNode, insertNode, reorderNode, resolveColour, resolveColours,
  type FrameNode, type LayoutDoc, type TextNode,
} from '@newsroom/design';
import { brandByKey } from '@newsroom/brands';
import type { ArtModel, CompositionSpec } from '@newsroom/design';

const brand = brandByKey('f1');

const model: ArtModel = {
  eyebrow: 'GP SPANYOL',
  headline: 'Verstappen menang di Barcelona',
  footnote: 'API.OPENF1.ORG · 12 SEP 2026',
  subhead: undefined,
  entity: null,
};

function specWith(m: Partial<ArtModel> = {}): CompositionSpec {
  return {
    brand,
    archetype: brand.archetypes[0]!,
    layout: 'hero-left',
    skin: brand.skins[0]!,
    accents: [],
    model: { ...model, ...m },
  };
}

describe('layout document sanitizing', () => {
  it('rejects a document whose root is not a frame', () => {
    expect(sanitizeDoc({ root: { kind: 'text', source: { type: 'static', value: 'x' } } })).toBeNull();
    expect(sanitizeDoc(null)).toBeNull();
    expect(sanitizeDoc('nope')).toBeNull();
  });

  it('clamps out-of-range numbers rather than rejecting the node', () => {
    const n = sanitizeNode({ kind: 'text', source: { type: 'static', value: 'a' }, weight: 9999, opacity: 42 }) as TextNode;
    expect(n.weight).toBe(900);
    expect(n.opacity).toBe(1);
  });

  it('swaps an inverted fit range so the binary search cannot fail closed', () => {
    const n = sanitizeNode({ kind: 'text', step: 'fit', source: { type: 'static', value: 'a' }, fit: { minPx: 200, maxPx: 40, lines: 2 } }) as TextNode;
    expect(n.fit!.minPx).toBe(40);
    expect(n.fit!.maxPx).toBe(200);
  });

  it('treats an unrecognised colour string as an inert token reference, never a raw value', () => {
    const n = sanitizeNode({ kind: 'text', source: { type: 'static', value: 'a' }, colour: 'url(javascript:alert(1))', step: 'enormous' }) as TextNode;
    // A colour is a { ref } or { hex } object now; an arbitrary string can only
    // become a `ref` (a lookup key), never a literal spliced into CSS — so an
    // unrecognised one just fails to resolve to any known token or palette
    // slot and falls safely back to `fg`, rather than needing to be rejected
    // at intake the way the old closed-enum shape had to.
    expect(n.colour).toEqual({ ref: 'url(javascript:alert(1))' });
    expect(resolveColour(n.colour!, { tokenHex: { fg: '#112233' } })).toBe('#112233');
    expect(n.step).toBe('body');
  });

  it('caps tree size so a hand-edited file cannot blow the renderer up', () => {
    // 400 siblings, well past the 200-node ceiling.
    const kids = Array.from({ length: 400 }, (_, i) => ({ kind: 'text', id: `t${i}`, source: { type: 'static', value: 'x' } }));
    const doc = sanitizeDoc({ root: { kind: 'frame', children: kids } })!;
    expect(doc.root.children.length).toBeLessThanOrEqual(200);
  });

  it('caps nesting depth', () => {
    let node: unknown = { kind: 'text', source: { type: 'static', value: 'deep' } };
    for (let i = 0; i < 40; i++) node = { kind: 'frame', children: [node] };
    const doc = sanitizeDoc({ root: node })!;
    let depth = 0;
    let cur: FrameNode | undefined = doc.root;
    while (cur?.children?.[0]?.kind === 'frame') { cur = cur.children[0] as FrameNode; depth++; }
    expect(depth).toBeLessThanOrEqual(12);
  });

  it('leaves an unset size unset, so the parent stack keeps deciding', () => {
    const n = sanitizeNode({ kind: 'text', source: { type: 'static', value: 'a' } }) as TextNode;
    expect(n.width).toBeUndefined();
    expect(n.height).toBeUndefined();
  });
});

describe('field binding', () => {
  it('resolves a bound field through its formatters in order', () => {
    const src = { type: 'field' as const, field: 'eyebrow', format: [{ key: 'lower' as const }, { key: 'suffix' as const, arg: '!' }] };
    expect(resolveText(src, model, brand)).toBe('gp spanyol!');
  });

  it('truncate keeps the ellipsis inside the budget', () => {
    expect(applyFormats('abcdefghij', [{ key: 'truncate', arg: 5 }])).toBe('abcd…');
    expect(applyFormats('abcdefghij', [{ key: 'truncate', arg: 5 }]).length).toBe(5);
  });

  it('returns null for a missing field so the renderer can omit the node', () => {
    expect(resolveText({ type: 'field', field: 'subhead' }, model, brand)).toBeNull();
  });

  it('uses the fallback when one is set, holding the slot open', () => {
    expect(resolveText({ type: 'field', field: 'subhead', fallback: '—' }, model, brand)).toBe('—');
  });

  it('reports which optional fields this claim actually carries', () => {
    const present = presentFields(model, brand);
    expect(present.has('headline')).toBe(true);
    expect(present.has('subhead')).toBe(false);
  });
});

describe('document rendering', () => {
  it('renders every seeded layout without throwing', () => {
    for (const layout of ['hero-left', 'hero-right', 'full-bleed', 'framed', 'split', 'stacked', 'big-number', 'portrait'] as const) {
      const doc = seedDoc(layout);
      const html = renderDocHtml(doc, { ...specWith(), layout }, { noFit: true });
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('class="art docart"');
    }
  });

  it('omits a node whose bound field is empty, rather than drawing a hole', () => {
    const doc = seedDoc('hero-left');
    const html = renderDocHtml(doc, specWith({ subhead: undefined }), { noFit: true });
    expect(html).not.toContain('hero-left-subhead');

    const withSub = renderDocHtml(doc, specWith({ subhead: 'Sesi kedua' }), { noFit: true });
    expect(withSub).toContain('hero-left-subhead');
    expect(withSub).toContain('Sesi kedua');
  });

  it('escapes claim text rather than letting it become markup', () => {
    const html = renderDocHtml(seedDoc('hero-left'), specWith({ headline: '<img src=x onerror=alert(1)>' }), { noFit: true });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('resolves every node colour to the exact literal hex resolveColours() computed for this skin', () => {
    const spec = specWith();
    const html = renderDocHtml(seedDoc('hero-left'), spec, { noFit: true });
    const body = html.slice(html.indexOf('class="art docart"'));
    const nodes = body.slice(body.indexOf('>') + 1);
    // Paint resolution deliberately emits literal hex, not var(--x): that's
    // what lets the contrast scanner measure the real, exact value per node.
    expect(nodes).toMatch(/color:#[0-9a-f]{3,8}/i);
    // The eyebrow node is `colour: accent-text`; its resolved literal must
    // match what resolveColours() computed for --accent-text on this skin —
    // pixel-identical to the old var(--accent-text) indirection.
    const { vars } = resolveColours(spec);
    expect(nodes).toContain(`color:${vars['--accent-text']}`);
  });

  it('renders the same document at a different canvas size', () => {
    const doc = seedDoc('hero-left');
    const story = renderDocHtml(doc, specWith(), { noFit: true, canvas: 'story' });
    expect(story).toContain('width:1080px');
    expect(story).toContain('height:1920px');
  });

  it('places an absolute node as a percentage, so it survives a canvas change', () => {
    const doc = seedDoc('portrait');
    const html = renderDocHtml(doc, specWith({ imageUrl: 'x' }), { noFit: true, imageSrc: 'data:image/png;base64,AA' });
    // portrait pins the photo to the right 52% of the frame
    expect(html).toContain('width:52.000%');
  });

  it('drops the photo entirely when the claim has no image', () => {
    const html = renderDocHtml(seedDoc('full-bleed'), specWith(), { noFit: true, imageSrc: null });
    // Scoped to the markup: the stylesheet legitimately mentions the selector.
    const body = html.slice(html.indexOf('<body'));
    expect(body).not.toContain('data-kind="image"');
    expect(body).not.toContain('<img');
  });
});

describe('tree editing', () => {
  const doc: LayoutDoc = seedDoc('hero-left');

  it('finds a node by id', () => {
    expect(findNode(doc.root, 'hero-left-headline')?.name).toBe('Headline');
  });

  it('removes a nested node without disturbing its siblings', () => {
    const next = removeNode(doc.root, 'hero-left-headline');
    expect(findNode(next, 'hero-left-headline')).toBeNull();
    expect(findNode(next, 'hero-left-subhead')).not.toBeNull();
  });

  it('inserts into a named frame', () => {
    const node = { kind: 'text' as const, id: 'new1', name: 'New', source: { type: 'static' as const, value: 'hi' } };
    const next = insertNode(doc.root, 'hero-left-body', node);
    expect(findNode(next, 'new1')).not.toBeNull();
  });

  it('reorders siblings and clamps at the ends', () => {
    const body = findNode(doc.root, 'hero-left-body') as FrameNode;
    const first = body.children[0]!.id;
    const moved = reorderNode(doc.root, first, 1);
    expect((findNode(moved, 'hero-left-body') as FrameNode).children[1]!.id).toBe(first);
    const clamped = reorderNode(doc.root, first, -1);
    expect((findNode(clamped, 'hero-left-body') as FrameNode).children[0]!.id).toBe(first);
  });
});
