import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sharedFingerprint, layoutFingerprint, isLayoutShippable, resetPassingCache, type PassingManifest } from '@newsroom/design';

/**
 * A minimal certification root — just enough directory shape for
 * sharedFingerprint()/layoutFingerprint() to walk without touching the real
 * repo, so this suite can mutate "brand config" freely.
 */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'passing-test-'));
  for (const dir of ['packages/design/src', 'packages/render/src', 'packages/render/assets', 'fixtures', 'brands/f1', 'brands/vct']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, 'packages/design/src/index.ts'), 'export const x = 1;');
  writeFileSync(join(root, 'brands/f1/tokens.ts'), 'export const tokens = { v: 1 };');
  writeFileSync(join(root, 'brands/vct/tokens.ts'), 'export const tokens = { v: 1 };');
  writeLayouts(root, 'f1', { session_result: { 'hero-left': { id: 'a' }, 'full-bleed': { id: 'b' } } });
  return root;
}

function writeLayouts(root: string, brand: string, doc: Record<string, Record<string, unknown>>): void {
  writeFileSync(join(root, 'brands', brand, 'layouts.json'), JSON.stringify(doc));
}

describe('per-layout certification', () => {
  let root: string;
  beforeEach(() => { root = makeRoot(); resetPassingCache(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('editing one layout leaves a sibling layout\'s fingerprint untouched', () => {
    const before = {
      a: layoutFingerprint('f1', 'session_result', 'hero-left', root),
      b: layoutFingerprint('f1', 'session_result', 'full-bleed', root),
    };
    writeLayouts(root, 'f1', { session_result: { 'hero-left': { id: 'a', edited: true }, 'full-bleed': { id: 'b' } } });
    const after = {
      a: layoutFingerprint('f1', 'session_result', 'hero-left', root),
      b: layoutFingerprint('f1', 'session_result', 'full-bleed', root),
    };
    expect(after.a).not.toBe(before.a);
    expect(after.b).toBe(before.b);
  });

  it('the same archetype/layout differs per brand, since each brand has its own document', () => {
    writeLayouts(root, 'vct', { session_result: { 'hero-left': { id: 'different' } } });
    const f1 = layoutFingerprint('f1', 'session_result', 'hero-left', root);
    const vct = layoutFingerprint('vct', 'session_result', 'hero-left', root);
    expect(f1).not.toBe(vct);
  });

  it('a shared-code change moves every layout\'s fingerprint', () => {
    const before = layoutFingerprint('f1', 'session_result', 'hero-left', root);
    writeFileSync(join(root, 'packages/design/src/index.ts'), 'export const x = 2;');
    const after = layoutFingerprint('f1', 'session_result', 'hero-left', root);
    expect(after).not.toBe(before);
  });

  it('sharedFingerprint never looks at brands/, so brand-only edits do not change it', () => {
    const before = sharedFingerprint(root);
    writeLayouts(root, 'f1', { session_result: { 'hero-left': { id: 'z' } } });
    const after = sharedFingerprint(root);
    expect(after).toBe(before);
  });

  it('isLayoutShippable passes when the manifest fp matches the real, current fingerprint', () => {
    const fp = layoutFingerprint('f1', 'session_result', 'hero-left'); // real project root
    const manifest: PassingManifest = {
      generatedAt: new Date().toISOString(), runtime: 'linux', fixtures: Array.from({ length: 11 }, (_, i) => `f${i}`),
      shared: sharedFingerprint(),
      layouts: { 'f1/session_result/hero-left': { fp, ok: true } },
    };
    expect(isLayoutShippable('f1', 'session_result', 'hero-left', manifest)).toBe(true);
    expect(isLayoutShippable('f1', 'session_result', 'full-bleed', manifest)).toBe(false); // no entry
  });

  it('fails closed on a stale fingerprint even when the manifest says ok', () => {
    const manifest: PassingManifest = {
      generatedAt: new Date().toISOString(), runtime: 'linux', fixtures: Array.from({ length: 11 }, (_, i) => `f${i}`),
      shared: 'irrelevant',
      layouts: { 'f1/session_result/hero-left': { fp: 'stale-hash', ok: true } },
    };
    expect(isLayoutShippable('f1', 'session_result', 'hero-left', manifest)).toBe(false);
  });

  it('fails closed on too few fixtures, and on a missing manifest', () => {
    expect(isLayoutShippable('f1', 'session_result', 'hero-left', null)).toBe(false);
    expect(isLayoutShippable('f1', 'session_result', 'hero-left', {
      generatedAt: '', runtime: 'linux', fixtures: ['one'], shared: '', layouts: {},
    })).toBe(false);
  });
});
