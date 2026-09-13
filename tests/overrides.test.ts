import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brandByKey } from '@newsroom/brands';
import {
  clearLayoutOverride, getLayoutOverride, loadLayoutOverrides, renderArtHtml,
  resetLayoutOverrideCache, sanitizeOverride, saveLayoutOverride, type CompositionSpec,
} from '@newsroom/design';
import { loadFixture } from '@newsroom/render';

describe('sanitizeOverride — never trust a number straight from a UI', () => {
  it('clamps out-of-range numbers instead of rejecting them', () => {
    expect(sanitizeOverride({ padding: 5 })).toEqual({ padding: 16 }); // below floor
    expect(sanitizeOverride({ padding: 9999 })).toEqual({ padding: 160 }); // above ceiling
  });

  it('drops NaN, Infinity and non-numeric values silently', () => {
    expect(sanitizeOverride({ padding: NaN })).toEqual({});
    expect(sanitizeOverride({ padding: Infinity })).toEqual({});
    expect(sanitizeOverride({ bodyAlign: 'sideways' as never })).toEqual({});
  });

  it('only accepts the exact enum values for alignment', () => {
    expect(sanitizeOverride({ bodyAlign: 'center', textAlign: 'right' })).toEqual({ bodyAlign: 'center', textAlign: 'right' });
  });

  it('swaps a headline floor that ended up above the ceiling, rather than shipping a fitText search that always fails', () => {
    expect(sanitizeOverride({ headlineMinPx: 100, headlineMaxPx: 40 })).toEqual({ headlineMinPx: 40, headlineMaxPx: 100 });
  });
});

describe('layout override persistence — one JSON file per brand, config-as-code', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'layout-overrides-'));
    vi.stubEnv('BRANDS_DIR', dir);
    resetLayoutOverrideCache();
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); resetLayoutOverrideCache(); });

  it('returns an empty override when nothing has been saved yet', () => {
    expect(getLayoutOverride('f1', 'classification', 'stacked')).toEqual({});
  });

  it('round-trips a save through the real file on disk', () => {
    const saved = saveLayoutOverride('f1', 'classification', 'stacked', { padding: 80, bodyAlign: 'center' });
    expect(saved).toEqual({ padding: 80, bodyAlign: 'center' });
    resetLayoutOverrideCache();
    expect(loadLayoutOverrides('f1')).toEqual({ classification: { stacked: { padding: 80, bodyAlign: 'center' } } });
  });

  it('merges a second save for a different layout rather than clobbering the first', () => {
    saveLayoutOverride('f1', 'classification', 'stacked', { padding: 80 });
    saveLayoutOverride('f1', 'classification', 'framed', { padding: 40 });
    resetLayoutOverrideCache();
    expect(loadLayoutOverrides('f1')).toEqual({
      classification: { stacked: { padding: 80 }, framed: { padding: 40 } },
    });
  });

  it('clearing one layout leaves siblings and other archetypes untouched', () => {
    saveLayoutOverride('f1', 'classification', 'stacked', { padding: 80 });
    saveLayoutOverride('f1', 'classification', 'framed', { padding: 40 });
    clearLayoutOverride('f1', 'classification', 'stacked');
    resetLayoutOverrideCache();
    expect(loadLayoutOverrides('f1')).toEqual({ classification: { framed: { padding: 40 } } });
  });

  it('sanitizes on save, so an out-of-range patch never reaches disk verbatim', () => {
    saveLayoutOverride('f1', 'classification', 'stacked', { padding: 9999 });
    resetLayoutOverrideCache();
    expect(getLayoutOverride('f1', 'classification', 'stacked')).toEqual({ padding: 160 });
  });

  it('degrades to no overrides on a corrupt file rather than crashing every render', () => {
    saveLayoutOverride('f1', 'classification', 'stacked', { padding: 80 });
    writeFileSync(join(dir, 'f1', 'layout-overrides.json'), '{ not valid json');
    resetLayoutOverrideCache();
    expect(loadLayoutOverrides('f1')).toEqual({});
  });
});

describe('renderArtHtml actually applies a saved override', () => {
  const brand = brandByKey('f1');
  const fixture = loadFixture('classification-basic');
  const archetype = brand.archetypes.find((a) => a.key === 'classification')!;

  const spec = (): CompositionSpec => ({
    brand, archetype, layout: 'framed',
    skin: brand.skins.find((s) => s.key === 'dark')!,
    accents: [], model: archetype.model(fixture.claim),
  });

  it('renders the brand default padding with no override saved', () => {
    const html = renderArtHtml(spec(), { noFit: true });
    expect(html).toContain(`--pad:${brand.tokens.pad}px`);
  });

  it('renders a saved padding and alignment override instead of the token default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'layout-overrides-render-'));
    vi.stubEnv('BRANDS_DIR', dir);
    resetLayoutOverrideCache();
    try {
      saveLayoutOverride('f1', 'classification', 'framed', { padding: 96, bodyAlign: 'end' });
      const html = renderArtHtml(spec(), { noFit: true });
      expect(html).toContain('--pad:96px');
      expect(html).toMatch(/<main class="body" style="align-content:end">/);
    } finally {
      vi.unstubAllEnvs();
      resetLayoutOverrideCache();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
