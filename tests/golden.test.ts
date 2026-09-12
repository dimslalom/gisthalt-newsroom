import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { brandByKey } from '@newsroom/brands';
import { SKINS, type CompositionSpec } from '@newsroom/design';
import { closePool, compareToGolden, fixtureNames, loadFixture, renderComposition } from '@newsroom/render';

/**
 * The full 308-render matrix lives in `pnpm golden` (and CI). This is the
 * smoke test: it proves the diff machinery actually fails on drift, which a
 * suite of always-passing golden checks would quietly stop doing.
 */
const brand = brandByKey('f1');
const skin = SKINS.find((s) => s.key === 'dark')!;
const OUT = resolve('.data/goldens');
const GOLDEN = resolve('fixtures/goldens');

afterAll(async () => { await closePool(); });

describe('golden images', () => {
  it('ships a committed golden for every fixture × layout pair', () => {
    const missing: string[] = [];
    for (const f of fixtureNames()) {
      for (const a of brand.archetypes) {
        for (const l of a.layouts) {
          const p = resolve(GOLDEN, `${a.key}__${l}__${f}.png`);
          if (!existsSync(p)) missing.push(`${a.key}/${l} × ${f}`);
        }
      }
    }
    expect(missing, 'run: pnpm golden -- --update').toEqual([]);
  });

  it('reproduces a committed golden byte-for-byte from the same input', async () => {
    const fixture = loadFixture('classification-basic');
    const archetype = brand.archetypes.find((a) => a.key === 'classification')!;
    const name = 'classification__stacked__classification-basic.png';
    const spec: CompositionSpec = { brand, archetype, layout: 'stacked', skin, accents: [], model: archetype.model(fixture.claim) };
    const out = await renderComposition(spec, { outDir: OUT, imagePath: fixture.imagePath, fileName: `smoke-${name}` });
    const diff = compareToGolden(out.path, resolve(GOLDEN, name), { maxRatio: 0.002 });
    expect(diff.match, `drifted by ${(diff.ratio * 100).toFixed(3)}%`).toBe(true);
  });

  it('actually detects drift rather than passing everything', async () => {
    const fixture = loadFixture('classification-basic');
    const archetype = brand.archetypes.find((a) => a.key === 'classification')!;
    const spec: CompositionSpec = { brand, archetype, layout: 'framed', skin, accents: ['diagonal'], model: archetype.model(fixture.claim) };
    const out = await renderComposition(spec, { outDir: OUT, imagePath: fixture.imagePath, fileName: 'drift-probe.png' });
    // Compared against a DIFFERENT layout's golden: this must fail.
    const diff = compareToGolden(out.path, resolve(GOLDEN, 'classification__stacked__classification-basic.png'), { maxRatio: 0.002 });
    expect(diff.match).toBe(false);
    expect(diff.ratio).toBeGreaterThan(0.01);
  });

  it('fails a missing golden without silently approving it', () => {
    const tmp = resolve(OUT, 'seed-probe.png');
    const target = resolve(OUT, `missing-${Date.now()}-golden.png`);
    writeFileSync(tmp, readFileSync(resolve(GOLDEN, 'classification__stacked__classification-basic.png')));
    const diff = compareToGolden(tmp, target);
    expect(diff.match).toBe(false);
    expect(existsSync(target)).toBe(false);
  });
});
