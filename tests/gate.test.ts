import { describe, expect, it } from 'vitest';
import { evaluateGate, numericValues, quoteSupports, type Claim, type GateContext } from '@newsroom/core';
import { blocklist, hedgeTerms, requiredFields, tierBAllowlist } from '../brands/f1/blocklist.ts';

const NOW = new Date('2026-09-12T14:00:00Z');

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  now: NOW,
  tierBAllowlist,
  blocklist,
  hedgeTerms,
  requiredFields,
  corroboration: [],
  corroborationWindowMinutes: 45,
  enableR2: true,
  enableR3: true,
  ...over,
});

const claim = (over: Partial<Claim> = {}): Claim => ({
  vertical: 'f1',
  claimType: 'session_result',
  entities: { driver: 'Kimi Antonelli', team: 'Mercedes', session: 'Practice 2', meeting: 'Spanyol GP' },
  values: { position: 1, driver: 'Kimi Antonelli', session: 'Practice 2', meeting: 'Spanyol GP' },
  supportingQuote: null,
  sourceTier: 'A',
  sourceDomain: 'api.openf1.org',
  observedAt: NOW,
  ...over,
});

describe('R0 — the hard block list', () => {
  it('drops anything touching injury, death, legal matters or a minor', () => {
    for (const term of ['injury', 'lawsuit', 'passed away', 'underage']) {
      const out = evaluateGate(claim({ headline: `Driver ${term} after incident` }), ctx());
      expect(out.outcome).toBe('drop');
      expect(out.rule).toBe('R0');
    }
  });

  it('drops a contested result even when the source is tier A', () => {
    const out = evaluateGate(claim({ headline: 'Provisional result pending appeal', sourceTier: 'A' }), ctx());
    expect(out).toMatchObject({ outcome: 'drop', rule: 'R0' });
  });

  it('is accent- and case-insensitive', () => {
    expect(evaluateGate(claim({ headline: 'CEDERA parah di lap 4' }), ctx()).outcome).toBe('drop');
  });
});

describe('R1 — tier A with a complete field contract', () => {
  it('auto-publishes when every required field is present', () => {
    const out = evaluateGate(claim(), ctx());
    expect(out).toMatchObject({ outcome: 'auto', rule: 'R1' });
  });

  it('sends a tier A claim with a missing required field to review, naming the field', () => {
    // The field is absent from values AND entities: the gate looks in both.
    const c = claim({
      entities: { driver: 'Antonelli', team: 'Mercedes', session: 'Practice 2' },
      values: { position: 1, driver: 'Antonelli', session: 'Practice 2' },
    });
    const out = evaluateGate(c, ctx());
    expect(out.outcome).toBe('review');
    expect(out.reason).toContain('meeting');
  });

  it('sends a tier A claimType with no contract to review rather than guessing', () => {
    const out = evaluateGate(claim({ claimType: 'mystery' }), ctx());
    expect(out).toMatchObject({ outcome: 'review', rule: 'R4' });
    expect(out.reason).toContain('no required-field contract');
  });
});

describe('R2 — allowlisted tier B with a quote covering every number', () => {
  const prose = (over: Partial<Claim> = {}) => claim({
    claimType: 'penalty',
    sourceTier: 'B',
    sourceDomain: 'autosport.com',
    entities: { driver: 'Lando Norris', team: 'McLaren' },
    values: { penalty: 5, reason: 'unsafe release' },
    supportingQuote: 'Norris was given a 5 second time penalty for an unsafe release.',
    ...over,
  });

  it('auto-publishes when the quote literally contains the number', () => {
    expect(evaluateGate(prose(), ctx())).toMatchObject({ outcome: 'auto', rule: 'R2' });
  });

  it('reviews when the quote does not contain the number', () => {
    const out = evaluateGate(prose({ supportingQuote: 'Norris was penalised for an unsafe release.' }), ctx());
    expect(out).toMatchObject({ outcome: 'review', rule: 'R4' });
  });

  it('reviews an off-allowlist domain even with a perfect quote', () => {
    expect(evaluateGate(prose({ sourceDomain: 'randomblog.example' }), ctx()).outcome).toBe('review');
  });

  it('never fires while R2 is disabled', () => {
    expect(evaluateGate(prose(), ctx({ enableR2: false })).outcome).toBe('review');
  });

  it('matches a lap time written as 1:33.662 against the float 93.662', () => {
    const c = prose({ values: { duration: 93.662 }, supportingQuote: 'Antonelli set a 1:33.662 to top the session.' });
    expect(evaluateGate(c, ctx())).toMatchObject({ outcome: 'auto', rule: 'R2' });
  });
});

describe('R3 — two independent tier B domains inside the window', () => {
  const rumourless = claim({
    claimType: 'driver_line', sourceTier: 'B', sourceDomain: 'autosport.com',
    entities: { driver: 'Antonelli', team: 'Mercedes' }, values: { season: '2027' },
  });

  it('auto-publishes on a second independent domain', () => {
    const out = evaluateGate(rumourless, ctx({
      corroboration: [{ itemId: 'i1', domain: 'motorsport.com', observedAt: new Date(NOW.getTime() - 10 * 60_000) }],
    }));
    expect(out).toMatchObject({ outcome: 'auto', rule: 'R3' });
  });

  it('ignores corroboration older than the window', () => {
    const out = evaluateGate(rumourless, ctx({
      corroboration: [{ itemId: 'i1', domain: 'motorsport.com', observedAt: new Date(NOW.getTime() - 90 * 60_000) }],
    }));
    expect(out.outcome).toBe('review');
  });

  it('does not count the same domain twice', () => {
    const out = evaluateGate(rumourless, ctx({
      corroboration: [{ itemId: 'i1', domain: 'autosport.com', observedAt: NOW }],
    }));
    expect(out.outcome).toBe('review');
  });
});

describe('R4 — everything else', () => {
  it('reviews hedged language however well sourced', () => {
    const out = evaluateGate(claim({
      sourceTier: 'B', sourceDomain: 'autosport.com', claimType: 'driver_line',
      headline: 'Antonelli reportedly set to sign', values: {}, supportingQuote: 'x',
    }), ctx());
    expect(out).toMatchObject({ outcome: 'review', rule: 'R4' });
    expect(out.reason).toContain('hedged');
  });

  it('never auto-publishes a tier C signal', () => {
    const out = evaluateGate(claim({ sourceTier: 'C', sourceDomain: 'reddit.com', values: {} }), ctx());
    expect(out).toMatchObject({ outcome: 'review', rule: 'R4' });
    expect(out.reason).toContain('never publishable alone');
  });
});

describe('quote support helpers', () => {
  it('finds numbers nested anywhere in values', () => {
    expect(numericValues({ a: 1, b: { c: 2 }, d: [3, { e: 4 }] }).sort()).toEqual([1, 2, 3, 4]);
  });
  it('accepts a rounded form of a decimal', () => {
    expect(quoteSupports('he was 1.5s off the pace', 1.5)).toBe(true);
    expect(quoteSupports('he was 2s off the pace', 1.5)).toBe(false);
  });
});
