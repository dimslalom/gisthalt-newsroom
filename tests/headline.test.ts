import { describe, expect, it } from 'vitest';
import { needsHook, safeHeadline } from '@newsroom/core';
import { checkHookHeadline, HOOK_TAG } from '@newsroom/llm';

const source = {
  title: "Kimi Antonelli's Spanish GP win will still \"sting\", says James Hinchcliffe",
  body: 'Antonelli won the race by 4.2 seconds in 2026.',
};

describe('hook headlines', () => {
  it('accepts a specific Indonesian hook', () => {
    expect(checkHookHeadline('Kemenangan Antonelli di GP Spanyol Masih Menyakitkan', source)).toBeNull();
  });
  it('rejects the English source title and English copy', () => {
    expect(checkHookHeadline(source.title, source)).not.toBeNull();
    expect(checkHookHeadline('Antonelli says the win will still sting', source)).toBe('reads as English');
  });
  it('rejects a model describing the source instead of writing a headline', () => {
    expect(checkHookHeadline('Sumber tidak tersedia untuk diringkas', source)).toBe('describes the source instead of the story');
    expect(checkHookHeadline('Artikel tidak dapat diringkas karena teks kosong', source)).not.toBeNull();
    expect(checkHookHeadline('FIA rilis daftar poin kejuaraan resmi', source)).toBeNull();
  });
  it('rejects generic labels, dashes, and invented numbers', () => {
    expect(checkHookHeadline('Kabar F1', source)).toBe('generic label, not a hook');
    expect(checkHookHeadline('Antonelli Menang — Hinchcliffe Terkejut', source)).toBe('contains a banned dash');
    expect(checkHookHeadline('Antonelli Menang dengan Selisih 9 Detik', source)).toContain('number not in the source');
  });
  it('holds prose claims until they carry a verified hook', () => {
    const prose = { sourceTier: 'B' as const, tags: ['unextracted'] };
    expect(needsHook(prose)).toBe(true);
    expect(needsHook({ ...prose, tags: ['unextracted', HOOK_TAG] })).toBe(false);
    expect(needsHook({ sourceTier: 'A' as const, tags: [] })).toBe(false);
  });
  it('shows the hook on a claim that has one even if extraction failed', () => {
    const claim = { tags: ['unextracted', HOOK_TAG], headline: 'Antonelli Rebut Kemenangan' };
    expect(safeHeadline(claim as never, 'fallback')).toBe('Antonelli Rebut Kemenangan');
  });
});
