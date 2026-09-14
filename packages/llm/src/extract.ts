import { numericValues, quoteSupports } from '@newsroom/core';
import type { Claim, RawItem } from '@newsroom/core';
import type { GeminiRouter } from './router.ts';
import { ANTI_AI_STYLE_RULES, hasBannedDash } from './style-rules.ts';

export interface ExtractedClaim {
  claimType: string;
  entities: Record<string, string>;
  values: Record<string, unknown>;
  supportingQuote: string | null;
  headline: string;
  tags: string[];
}

/**
 * The extraction prompt contract. Fields only, never whole articles beyond what
 * is needed, and a mandatory quote for every numeric value. The instruction is
 * not trusted: the result is validated in code below.
 */
export function extractionPrompt(item: RawItem): string {
  return `You are an extraction function for an Indonesian multi-brand newsroom. You never decide whether something is true; you only structure what the text says.

Return JSON only, matching:
{"claimType": string, "entities": {...}, "values": {...}, "supportingQuote": string|null, "headline": string, "tags": string[]}

Rules:
- claimType is one of: session_result, classification, standings, penalty, driver_line, schedule, quote, article, match_result, map_breakdown, player_stat, roster_move, bracket, release, cast, trailer, box_office, review.
- entities uses keys from: driver, team, meeting, session, speaker, season. Each value MUST be a single plain string — never a nested object or an array. If more than one applies (e.g. two drivers), pick the most prominent one or join them with ", ". Omit a key entirely if it doesn't apply — don't include it set to null.
- values holds typed facts only (numbers as numbers).
- supportingQuote MUST be one sentence copied VERBATIM from the source text that contains EVERY numeric value you put in values. If no single sentence does, set supportingQuote to null.
- tags may include: rumour, exclusive, report, official, confirmed.
- headline is a short Indonesian headline, max 70 characters, containing no facts absent from values/entities.

${ANTI_AI_STYLE_RULES}

SOURCE (${item.sourceDomain}):
TITLE: ${item.title}
BODY: ${item.body.slice(0, 4000)}`;
}

export interface ExtractionOutcome {
  claim: Claim | null;
  /** Set when the quote requirement was violated. Downgrades the gate outcome. */
  quoteViolation: string | null;
  model: string;
  cached: boolean;
}

/**
 * The prompt asks for plain-string entity values, but the model sometimes
 * nests one anyway (`{"driver": {"name": "..."}}`), lists several (`{"driver":
 * ["a", "b"]}`) when more than one applies, sets one `null` for a key that
 * doesn't apply to this article (no speaker to quote, say) instead of
 * omitting it, or writes a bare number for something like a season
 * (`"season": 2026` instead of `"2026"`). None of that invents a fact — it's
 * either the same value already committed to in a different shape, or an
 * explicit "not applicable" — so this coerces and drops rather than
 * discarding the whole extraction over it. An entity value that isn't
 * string/number/boolean/array/named-object/null is still rejected: that's
 * not a shape variance, that's the model not extracting a name at all.
 */
function normaliseEntities(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    else if (Array.isArray(v)) {
      const joined = v.filter((x) => typeof x === 'string').join(', ');
      if (!joined) return null;
      out[k] = joined;
    } else if (typeof v === 'object') {
      const name = (v as Record<string, unknown>).name ?? (v as Record<string, unknown>).title;
      if (typeof name !== 'string') return null;
      out[k] = name;
    } else return null;
  }
  return out;
}

export async function extractClaim(router: GeminiRouter, item: RawItem): Promise<ExtractionOutcome> {
  const res = await router.call<ExtractedClaim>({
    purpose: 'extract',
    prompt: extractionPrompt(item),
    json: true,
    cacheKey: `extract:${item.sourceKey}:${item.externalId}:${item.body}`, 
  });

  if (res.offline || !res.json) {
    // No key, or unparseable: fall back to a claim that carries no extracted
    // numbers at all, which the gate will send to review. Never invent.
    return {
      claim: {
        vertical: item.vertical,
        claimType: 'article',
        // The title is the only thing distinguishing one unextracted article
        // from another, so it has to enter the dedupe hash. Without it every
        // unextracted item collapses into a single claim.
        entities: { title: item.title },
        values: {},
        supportingQuote: null,
        sourceTier: item.tier === 'A' ? 'B' : item.tier,
        sourceDomain: item.sourceDomain,
        observedAt: item.observedAt,
        tags: ['unextracted'],
        headline: item.title,
        imageUrl: item.imageUrl ?? null,
      },
      quoteViolation: res.offline ? 'no model available: unextracted' : 'model returned unparseable JSON',
      model: res.model,
      cached: res.cached,
    };
  }

  const e = res.json;
  const entities = typeof e === 'object' && e !== null ? normaliseEntities((e as { entities?: unknown }).entities) : null;
  if (typeof e !== 'object' || e === null || !entities || !e.values || typeof e.values !== 'object' || Array.isArray(e.values) || (e.tags && (!Array.isArray(e.tags) || e.tags.some((v) => typeof v !== 'string')))) throw new Error('invalid extraction response shape');
  const quote = typeof e.supportingQuote === 'string' ? e.supportingQuote : null;
  const violation = validateQuote(quote, e.values ?? {}, `${item.title}\n${item.body}`);
  // A headline that smuggled in a banned dash is discarded, not patched.
  const headline = e.headline && !hasBannedDash(e.headline) ? e.headline : item.title;

  return {
    claim: {
      vertical: item.vertical,
      claimType: e.claimType || 'article',
      entities,
      values: e.values ?? {},
      supportingQuote: violation ? null : quote,
      sourceTier: item.tier === 'A' ? 'B' : item.tier,
      sourceDomain: item.sourceDomain,
      observedAt: item.observedAt,
      tags: e.tags ?? [],
      headline,
      imageUrl: item.imageUrl ?? null,
    },
    quoteViolation: violation,
    model: res.model,
    cached: res.cached,
  };
}

/**
 * Validated in code after the response returns: the quote must exist in the
 * source text, and must literally contain every numeric value. A model that
 * claims support it cannot show gets its claim downgraded, not trusted.
 */
export function validateQuote(quote: string | null, values: Record<string, unknown>, body: string): string | null {
  const numbers = numericValues(values);
  if (!quote || quote.trim() === '') return numbers.length ? `support found for 0 of ${numbers.length} numbers` : null;
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (!normalise(body).includes(normalise(quote))) return 'quote not found verbatim in the source text';
  const unsupported = numbers.filter((v) => !quoteSupports(quote, v));
  if (unsupported.length) return `support found for ${numbers.length - unsupported.length} of ${numbers.length} numbers`;
  return null;
}
