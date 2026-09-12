import type { Claim, RawItem } from '@newsroom/core';

/** Keys that are entities (who/where) rather than values (what happened). */
const ENTITY_KEYS = new Set(['driver', 'team', 'meeting', 'session', 'speaker', 'circuit', 'teamColour', 'title', 'team1', 'team2', 'player', 'tournament', 'studio', 'speaker']);

/**
 * Tier A structured payload -> typed Claim, with zero model calls. Facts come
 * from machines: this path is the majority of race-weekend volume and it never
 * touches Gemini.
 */
export function structuredClaim(item: RawItem): Claim {
  const payload = { ...item.payload } as Record<string, unknown>;
  const claimType = String(payload.claimType ?? 'article');
  delete payload.claimType;

  const entities: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (ENTITY_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) entities[k] = String(v);
    else values[k] = v;
  }

  return {
    vertical: item.vertical,
    claimType,
    entities,
    values,
    supportingQuote: null, // Tier A needs none: the endpoint is the evidence.
    sourceTier: item.tier,
    sourceDomain: item.sourceDomain,
    observedAt: item.observedAt,
    headline: item.title,
    imageUrl: item.imageUrl ?? null,
    tags: ['structured'],
  };
}

/** A single-driver headline claim derived from a full classification. */
export function topResultClaim(classification: Claim): Claim | null {
  const rows = classification.values.rows as { position?: number; driver?: string; team?: string; duration?: number }[] | undefined;
  const winner = rows?.find((r) => r.position === 1);
  if (!winner) return null;
  return {
    ...classification,
    claimType: 'session_result',
    entities: {
      ...classification.entities,
      driver: winner.driver ?? '',
      team: winner.team ?? '',
    },
    values: { position: 1, duration: winner.duration ?? null, driver: winner.driver, session: classification.entities.session, meeting: classification.entities.meeting },
    headline: winner.driver ?? classification.headline,
  };
}
