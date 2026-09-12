import { describe, expect, it } from 'vitest';
import {
  contentHash, DASH, dateId, dedupeHash, gap, lapTime, mulberry32, num, pickBest,
  preExtractionKey, pos, scoreCandidate, seedFrom, text, type RawItem,
} from '@newsroom/core';

const base = { vertical: 'f1' as const, claimType: 'session_result', entities: { driver: 'Kimi Antonelli', team: 'Mercedes' }, values: { position: 1, duration: 93.662 } };

describe('dedupeHash', () => {
  it('collapses the same fact from four outlets to one hash', () => {
    const a = dedupeHash(base);
    const b = dedupeHash({ ...base, entities: { team: 'mercedes', driver: 'KIMI ANTONELLI' } });
    expect(b).toBe(a);
  });

  it('ignores accents, so Hülkenberg and Hulkenberg are one claim', () => {
    expect(dedupeHash({ ...base, entities: { driver: 'Nico Hülkenberg' } }))
      .toBe(dedupeHash({ ...base, entities: { driver: 'Nico Hulkenberg' } }));
  });

  it('treats a different value as a different claim', () => {
    expect(dedupeHash({ ...base, values: { position: 2, duration: 93.662 } })).not.toBe(dedupeHash(base));
  });

  it('rounds to 3dp so float noise does not split a claim', () => {
    expect(dedupeHash({ ...base, values: { position: 1, duration: 93.6620001 } })).toBe(dedupeHash(base));
  });

  it('is stable regardless of key order', () => {
    expect(dedupeHash({ ...base, values: { duration: 93.662, position: 1 } })).toBe(dedupeHash(base));
  });
});

describe('pre-extraction dedupe', () => {
  const item = (over: Partial<RawItem>): RawItem => ({
    sourceKey: 'rss:autosport', externalId: 'a1', vertical: 'f1', tier: 'B',
    sourceDomain: 'autosport.com', rawUrl: null, title: 'Norris wins in Madrid after late safety car',
    body: '', payload: {}, observedAt: new Date(), ...over,
  });

  it('collapses the same wire story arriving from two outlets BEFORE extraction', () => {
    const a = preExtractionKey(item({}));
    const b = preExtractionKey(item({ sourceKey: 'rss:motorsport', sourceDomain: 'motorsport.com', externalId: 'b7' }));
    expect(b).toBe(a);
  });

  it('keeps tier A items distinct by their own external id', () => {
    const a = preExtractionKey(item({ tier: 'A', sourceKey: 'openf1', externalId: 'session_result:11363' }));
    const b = preExtractionKey(item({ tier: 'A', sourceKey: 'openf1', externalId: 'session_result:11369' }));
    expect(a).not.toBe(b);
  });

  it('contentHash changes when the body changes', () => {
    const a = contentHash({ sourceKey: 's', externalId: 'e', title: 't', body: 'one' });
    expect(contentHash({ sourceKey: 's', externalId: 'e', title: 't', body: 'two' })).not.toBe(a);
  });
});

describe('formatting — a missing value is a dash, never blank or "undefined"', () => {
  it('formats float seconds as a lap time in one place', () => {
    expect(lapTime(93.662)).toBe('1:33.662');
    expect(lapTime(59.004)).toBe('59.004');
    expect(lapTime(5398.223)).toBe('1:29:58.223');
    expect(lapTime(null)).toBe(DASH);
    expect(lapTime(undefined)).toBe(DASH);
  });

  it('renders a dash for P1 rather than "+0.000"', () => {
    expect(gap(0, 1)).toBe(DASH);
    expect(gap(0.113, 2)).toBe('+0.113');
    expect(gap('+1 LAP', 19)).toBe('+1 LAP');
    expect(gap(null, 5)).toBe(DASH);
  });

  it('renders DNF/DNS in place of a position', () => {
    expect(pos(null, 'DNF')).toBe('DNF');
    expect(pos(3)).toBe('3');
    expect(pos(null)).toBe(DASH);
  });

  it('never lets the string "undefined" reach a canvas', () => {
    expect(text(undefined)).toBe(DASH);
    expect(text('undefined')).toBe(DASH);
    expect(num(null)).toBe(DASH);
  });

  it('renders TBA for an unknown release date', () => {
    expect(dateId(null)).toBe('TBA');
    expect(dateId('not a date')).toBe('TBA');
    expect(dateId('2026-09-12T00:00:00Z')).toBe('12 Sep 2026');
  });
});

describe('shuffle bag', () => {
  const c = (layout: string, skin: string, accents: string[] = []) => ({ layout, skin, accents });

  it('penalises a layout used in the last four posts', () => {
    const history = [c('hero-left', 'dark'), c('framed', 'light'), c('split', 'team'), c('stacked', 'archival')];
    expect(scoreCandidate(c('hero-left', 'tournament'), history, 0))
      .toBeLessThan(scoreCandidate(c('portrait', 'tournament'), history, 0));
  });

  it('stops penalising a layout once it falls out of the window', () => {
    const history = [c('a', 'dark', ['grain']), c('b', 'light'), c('c', 'team'), c('d', 'archival'), c('hero-left', 'dark')];
    expect(scoreCandidate(c('hero-left', 'tournament'), history, 0)).toBe(0);
  });

  it('never picks the layout used last when an alternative exists', () => {
    const history = [c('hero-left', 'dark')];
    const pool = [c('hero-left', 'dark'), c('framed', 'light'), c('portrait', 'team')];
    for (let seed = 0; seed < 40; seed++) {
      expect(pickBest(pool, history, seed).layout).not.toBe('hero-left');
    }
  });

  it('is deterministic for a given seed, so a reshuffle is reproducible', () => {
    const pool = [c('a', 'dark'), c('b', 'light'), c('c', 'team'), c('d', 'archival')];
    expect(pickBest(pool, [], 42)).toEqual(pickBest(pool, [], 42));
  });

  it('produces a spread rather than one winner across many seeds', () => {
    const pool = [c('a', 'dark'), c('b', 'light'), c('c', 'team'), c('d', 'archival')];
    const seen = new Set(Array.from({ length: 60 }, (_, i) => pickBest(pool, [], i).layout));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('seeds identically from the same string and differently per reshuffle', () => {
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
    expect(seedFrom('abc', 1)).not.toBe(seedFrom('abc', 0));
    expect(mulberry32(7)()).toBe(mulberry32(7)());
  });
});
