import { describe, expect, it } from 'vitest';
import {
  approximateMeasure, assertContrast, ContrastError, contrastRatio, cornerFromScores,
  fitText, onColourFor, treatmentFromStats,
} from '@newsroom/design';
import { entities, resolveEntity } from '../brands/f1/entities.ts';

describe('fitText', () => {
  const measure = approximateMeasure();

  it('picks the largest size that fits and never exceeds the ceiling', () => {
    const r = fitText('Antonelli', { width: 900, height: 260 }, { minPx: 34, maxPx: 118, maxLines: 2 }, measure);
    expect(r.overflow).toBe(false);
    expect(r.px).toBeLessThanOrEqual(118);
    expect(r.px).toBeGreaterThanOrEqual(34);
  });

  it('shrinks rather than overflowing as the text grows', () => {
    const box = { width: 900, height: 260 };
    const opts = { minPx: 34, maxPx: 118, maxLines: 3 };
    const short = fitText('Norris', box, opts, measure).px;
    const long = fitText('Norris memenangkan balapan di Madring setelah duel panjang', box, opts, measure).px;
    expect(long).toBeLessThan(short);
  });

  it('reports overflow and ellipsises below the floor, so the composer can switch layout', () => {
    const r = fitText('x'.repeat(2000), { width: 400, height: 120 }, { minPx: 34, maxPx: 118, maxLines: 2 }, measure);
    expect(r.overflow).toBe(true);
    expect(r.ellipsised).toBe(true);
    expect(r.text.endsWith('…')).toBe(true);
  });

  it('never returns a size below the floor', () => {
    const r = fitText('a very long headline '.repeat(20), { width: 300, height: 100 }, { minPx: 40, maxPx: 90, maxLines: 2 }, measure);
    expect(r.px).toBe(40);
  });
});

describe('assertContrast', () => {
  it('passes a readable pairing', () => {
    expect(() => assertContrast([{ label: 'body', fg: '#F2F5F6', bg: '#0A0C0E' }])).not.toThrow();
  });

  it('FAILS THE RENDER on an unreadable pairing rather than shipping it', () => {
    expect(() => assertContrast([{ label: 'body', fg: '#00D7B6', bg: '#FFFFFF' }])).toThrow(ContrastError);
  });

  it('allows a lower ratio for large text only', () => {
    const pair = { label: 'hero', fg: '#7C8B93', bg: '#12161A' };
    expect(() => assertContrast([{ ...pair, large: true }])).not.toThrow();
  });

  it('computes the WCAG reference ratio for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});

describe('entity colour table', () => {
  it('stores a contrast-checked pairing with every hex, so light-on-Mercedes-cyan never happens', () => {
    for (const e of Object.values(entities)) {
      expect(contrastRatio(e.onColour, e.hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('swaps the text colour for a near-white and a near-black entity colour', () => {
    expect(onColourFor('#F8F8F4')).toBe('#0A0C0E');
    expect(onColourFor('#101010')).toBe('#F2F5F6');
  });

  it('resolves a team by name, slug or the raw hex OpenF1 returns', () => {
    expect(resolveEntity('Mercedes')?.hex).toBe('#00D7B6');
    expect(resolveEntity('red_bull')?.name).toBe('Red Bull Racing');
    expect(resolveEntity('#ED1131')?.name).toBe('Ferrari');
    expect(resolveEntity(null)).toBeNull();
  });
});

describe('pickTextTreatment', () => {
  it('goes light with a scrim over a dark region', () => {
    const t = treatmentFromStats(40, 18);
    expect(t.overImage).toBe(true);
    expect(t.colour).toBe('#F2F5F6');
  });

  it('goes dark over a bright region', () => {
    expect(treatmentFromStats(220, 15).colour).toBe('#0A0C0E');
  });

  it('refuses the image entirely when variance is too high for any scrim', () => {
    const t = treatmentFromStats(128, 90);
    expect(t.overImage).toBe(false);
  });

  it('darkens hardest over mid-grey, the worst case', () => {
    expect(treatmentFromStats(128, 10).scrim).toBeGreaterThan(treatmentFromStats(40, 10).scrim);
  });
});

describe('pickLogoCorner', () => {
  it('picks the quietest corner', () => {
    expect(cornerFromScores({ tl: 40, tr: 38, bl: 5, br: 30 })).toBe('bl');
  });

  it('uses a fixed tie-break order, so placement does not jump around a series', () => {
    expect(cornerFromScores({ tl: 5, tr: 5, bl: 5, br: 5 })).toBe('br');
  });

  it('falls back to a solid strip when every corner is busy', () => {
    expect(cornerFromScores({ tl: 40, tr: 44, bl: 38, br: 51 })).toBe('strip');
  });
});
