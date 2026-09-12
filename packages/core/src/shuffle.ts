/**
 * Anti-repetition. Random selection produces visible clumps; nine good posts
 * that look identical on a profile grid is the specific failure this prevents.
 */
export interface Candidate {
  layout: string;
  skin: string;
  accents: string[];
}

export interface HistoryEntry {
  layout: string;
  skin: string;
  accents: string[];
}

const accentKey = (a: string[]) => [...a].sort().join('+') || 'none';

export function scoreCandidate(c: Candidate, history: HistoryEntry[], jitter: number): number {
  let score = jitter; // small tie-breaker, injected so the function stays pure
  if (history.slice(0, 4).some((h) => h.layout === c.layout)) score -= 8;
  if (history.slice(0, 3).some((h) => h.skin === c.skin)) score -= 4;
  const prev = history[0];
  if (prev && accentKey(prev.accents) === accentKey(c.accents)) score -= 1;
  return score;
}

/** Deterministic per-seed PRNG so a reshuffle is reproducible from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickBest(candidates: Candidate[], history: HistoryEntry[], seed: number): Candidate {
  const rnd = mulberry32(seed);
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(c, history, rnd() * 0.9);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  if (!best) throw new Error('pickBest called with no candidates');
  return best;
}

/** Stable 32-bit seed from any string, so the same claim reshuffles the same way. */
export function seedFrom(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
