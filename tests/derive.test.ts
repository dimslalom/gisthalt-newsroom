import { describe, expect, it } from 'vitest';
import {
  mirror, photoTo, bodyTo, promote, deriveLayout, suggestTransforms, seedDoc, sanitizeDoc,
  findNode, BUILTIN_LAYOUTS,
} from '@newsroom/design';

describe('derive-siblings transforms', () => {
  it('mirror is an involution', () => {
    for (const layout of BUILTIN_LAYOUTS) {
      const doc = seedDoc(layout);
      const twice = mirror(mirror(doc));
      expect(twice).toEqual(doc);
    }
  });

  it('mirror swaps a horizontal frame\'s child order and start/end alignment', () => {
    const doc = seedDoc('hero-left');
    const mirrored = mirror(doc);
    // hero-left's header is horizontal — its children should reverse.
    const before = findNode(doc.root, 'hero-left-hdr');
    const after = findNode(mirrored.root, 'hero-left-hdr');
    expect(before?.kind).toBe('frame');
    expect(after?.kind).toBe('frame');
    if (before?.kind === 'frame' && after?.kind === 'frame') {
      expect(after.children.map((c) => c.id)).toEqual([...before.children.map((c) => c.id)].reverse());
    }
  });

  it('mirror swaps absolute left/right insets', () => {
    const doc = seedDoc('portrait'); // photo is inset from the right
    const photo = findNode(doc.root, 'portrait-photo');
    expect(photo?.position?.mode).toBe('absolute');
    const mirrored = mirror(doc);
    const mirroredPhoto = findNode(mirrored.root, 'portrait-photo');
    if (photo?.position?.mode === 'absolute' && mirroredPhoto?.position?.mode === 'absolute') {
      expect(mirroredPhoto.position.left).toBe(photo.position.right);
      expect(mirroredPhoto.position.right).toBe(photo.position.left);
    }
  });

  it('every built-in layout yields a renderable (sanitizable) doc after each transform', () => {
    for (const layout of BUILTIN_LAYOUTS) {
      const doc = seedDoc(layout);
      for (const transformed of [
        mirror(doc),
        photoTo(doc, 'left'), photoTo(doc, 'right'), photoTo(doc, 'top'), photoTo(doc, 'full'),
        bodyTo(doc, { justify: 'center', align: 'center', textAlign: 'center' }),
        promote(doc, `${layout}-headline`, 'mega'),
        deriveLayout(doc, [{ type: 'mirror' }, { type: 'photoTo', position: 'left' }, { type: 'bodyTo', textAlign: 'right' }]),
      ]) {
        expect(sanitizeDoc(transformed)).not.toBeNull();
      }
    }
  });

  it('photoTo repositions the node named Photo without touching a doc that has none', () => {
    const doc = seedDoc('hero-left');
    const moved = photoTo(doc, 'left');
    const photo = findNode(moved.root, 'hero-left-photo');
    expect(photo?.position).toEqual({ mode: 'absolute', top: 0, left: 0, width: 0.52, height: 1 });

    const noPhotoDoc = { ...doc, root: { ...doc.root, children: doc.root.children.filter((c) => c.kind !== 'image') } };
    expect(photoTo(noPhotoDoc, 'left')).toEqual(noPhotoDoc);
  });

  it('promote only changes a matching text node\'s step', () => {
    const doc = seedDoc('hero-left');
    const promoted = promote(doc, 'hero-left-headline', 'mega');
    const node = findNode(promoted.root, 'hero-left-headline');
    expect(node?.kind === 'text' && node.step).toBe('mega');
    // A non-text or missing id is a no-op, not a crash.
    expect(promote(doc, 'does-not-exist', 'mega')).toEqual(doc);
  });

  it('suggestTransforms proposes a mirror for the known hero-left/hero-right pair, nothing otherwise', () => {
    expect(suggestTransforms('hero-left', 'hero-right')).toEqual([{ type: 'mirror' }]);
    expect(suggestTransforms('hero-left', 'full-bleed')).toEqual([]);
  });
});
