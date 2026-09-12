import type { Claim, GateContext, GateOutcome } from './contracts.ts';

const fold = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Collect every numeric value anywhere inside `values`, including nested. */
export function numericValues(values: Record<string, unknown>): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) out.push(Number(v));
  };
  Object.values(values).forEach(walk);
  return out;
}

/**
 * Does the quote literally support this number? Accepts the number written as
 * an integer, with its own decimals, or as a lap time (93.662 -> 1:33.662).
 * Deliberately strict: a model claiming support it cannot show is the exact
 * failure mode this rule exists to catch.
 */
export function quoteSupports(quote: string, value: number): boolean {
  const q = quote.replace(/[, ]/g, '');
  const forms = [String(value)];
  if (value >= 60 && value < 6000) {
    const millis = Math.round(value * 1000);
    forms.push(`${Math.floor(millis / 60000)}:${((millis % 60000) / 1000).toFixed(3).padStart(6, '0')}`);
  }
  return forms.some((f) => {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\d.:])${escaped}(?:\\.0+)?(?![\\d.]|:\\d)`).test(q);
  });
}

function hits(haystack: string, terms: string[]): string | null {
  const h = fold(haystack);
  for (const t of terms) {
    const term = fold(t).trim();
    if (term && h.includes(term)) return t;
  }
  return null;
}

/**
 * The five rules, evaluated in order. First match wins. Pure. No IO.
 * No model is ever consulted here; this is the heart of the system.
 */
export function evaluateGate(claim: Claim, ctx: GateContext): GateOutcome {
  const surface = [
    claim.headline ?? '',
    claim.supportingQuote ?? '',
    claim.claimType,
    JSON.stringify(claim.values),
    Object.values(claim.entities).join(' '),
    (claim.tags ?? []).join(' '),
  ].join(' \n ');

  // R0 — hard block. Contested results, injury, death, legal matters, minors.
  const blocked = hits(surface, ctx.blocklist);
  if (blocked) {
    return { outcome: 'drop', rule: 'R0', reason: `blocklist term "${blocked}"` };
  }

  // Hedged language never auto-publishes, whatever the tier.
  const hedge = hits(surface, ctx.hedgeTerms);
  if (hedge) {
    return { outcome: 'review', rule: 'R4', reason: `hedged language "${hedge}"` };
  }

  if ((claim.tags ?? []).some((t) => t.startsWith('quote:') || t === 'unextracted')) return { outcome: 'review', rule: 'R4', reason: 'extraction or quote validation failed' };

  // R1 — tier A endpoint and every required field for this claimType populated.
  if (claim.sourceTier === 'A') {
    const required = ctx.requiredFields[claim.claimType] ?? [];
    const missing = required.filter((f) => {
      const v = (claim.values as Record<string, unknown>)[f] ?? (claim.entities as Record<string, unknown>)[f];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    if (required.length > 0 && missing.length === 0) {
      return { outcome: 'auto', rule: 'R1', reason: `tier A, all required fields present (${required.join(', ')})` };
    }
    return {
      outcome: 'review',
      rule: 'R4',
      reason: required.length === 0
        ? `tier A but no required-field contract for claimType "${claim.claimType}"`
        : `tier A but missing ${missing.join(', ')}`,
    };
  }

  const allowlisted = ctx.tierBAllowlist.some((d) => domainMatches(claim.sourceDomain, d));

  // R2 — allowlisted tier B AND the quote covers every numeric value.
  if (ctx.enableR2 && claim.sourceTier === 'B' && allowlisted) {
    const numbers = numericValues(claim.values);
    const quote = claim.supportingQuote ?? '';
    const unsupported = numbers.filter((n) => !quoteSupports(quote, n));
    if (quote.trim() !== '' && unsupported.length === 0) {
      return {
        outcome: 'auto',
        rule: 'R2',
        reason: `tier B allowlisted, quote supports ${numbers.length} of ${numbers.length} numbers`,
      };
    }
    // Fall through to R3 — a second outlet can still carry it.
  }

  // R3 — two or more independent tier B domains assert the same hash in-window.
  if (ctx.enableR3 && claim.sourceTier === 'B') {
    const cutoff = ctx.now.getTime() - ctx.corroborationWindowMinutes * 60_000;
    const domains = new Map<string, string>();
    for (const c of ctx.corroboration) {
      if (c.observedAt.getTime() >= cutoff && c.observedAt <= ctx.now && ctx.tierBAllowlist.some((d) => domainMatches(c.domain, d))) domains.set(independentDomain(c.domain, ctx.tierBAllowlist), c.itemId);
    }
    if (allowlisted && claim.observedAt.getTime() >= cutoff && claim.observedAt <= ctx.now) domains.set(independentDomain(claim.sourceDomain, ctx.tierBAllowlist), 'self');
    if (domains.size >= 2) {
      return {
        outcome: 'auto',
        rule: 'R3',
        reason: `corroborated by ${domains.size} independent domains within ${ctx.corroborationWindowMinutes}m`,
        corroboratingItemIds: [...domains.values()].filter((v) => v !== 'self'),
      };
    }
  }

  // R4 — everything else.
  const why = claim.sourceTier === 'C'
    ? 'tier C signal, never publishable alone'
    : allowlisted
      ? 'tier B without quote support or a second source'
      : `domain ${claim.sourceDomain} not on the tier B allowlist`;
  return { outcome: 'review', rule: 'R4', reason: why };
}

export const domainMatches = (host: string, allowed: string): boolean => {
  host = host.toLowerCase().replace(/\.$/, ''); allowed = allowed.toLowerCase();
  return host === allowed || host.endsWith(`.${allowed}`);
};
const independentDomain = (host: string, allowlist: string[]) =>
  allowlist.filter((d) => domainMatches(host, d)).sort((a, b) => a.length - b.length)[0] ?? host;
