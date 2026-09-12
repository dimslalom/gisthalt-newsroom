import { evaluateGate } from '@newsroom/core';
import type { Claim, GateOutcome } from '@newsroom/core';
import type { ClaimRow } from '@newsroom/db';
import { brandForVertical } from '@newsroom/brands';
import type { Ctx } from '../context.ts';

export const REVIEW_TTL_MINUTES = Number(process.env.REVIEW_TTL_MINUTES ?? 90);

export const claimOf = (row: ClaimRow): Claim => ({
  vertical: row.vertical, claimType: row.claimType, entities: row.entities, values: row.values,
  supportingQuote: row.supportingQuote, sourceTier: row.sourceTier, sourceDomain: row.sourceDomain,
  observedAt: row.observedAt, tags: row.tags, headline: row.headline ?? undefined, imageUrl: row.imageUrl,
});

/**
 * Stage 3. Five rules, no model, first match wins. R2 and R3 stay off until the
 * quote requirement has proven itself on real items.
 */
export function gateClaim(ctx: Ctx, row: ClaimRow): GateOutcome {
  const brand = brandForVertical(row.vertical);
  const now = ctx.now();
  const outcome = evaluateGate(claimOf(row), {
    now,
    tierBAllowlist: brand.tierBAllowlist,
    blocklist: brand.blocklist,
    hedgeTerms: brand.hedgeTerms,
    requiredFields: brand.requiredFields,
    corroboration: ctx.store.corroborationFor(row.dedupeHash, row.itemId),
    corroborationWindowMinutes: 45,
    enableR2: process.env.ENABLE_R2 === 'true',
    enableR3: process.env.ENABLE_R3 === 'true',
  });

  ctx.store.insertDecision({
    claimId: row.id,
    rule: outcome.rule,
    outcome: outcome.outcome,
    reason: outcome.reason,
    corroboratingItemIds: 'corroboratingItemIds' in outcome ? outcome.corroboratingItemIds ?? [] : [],
    decidedAt: now,
  });

  if (outcome.outcome === 'review') {
    ctx.store.insertReview({
      claimId: row.id,
      compositionId: null,
      state: 'pending',
      reason: outcome.reason,
      rule: outcome.rule,
      createdAt: now,
      // An unapproved breaking item is worthless after 90 minutes.
      expiresAt: new Date(now.getTime() + REVIEW_TTL_MINUTES * 60_000),
      resolvedAt: null,
      note: null,
    });
  }

  ctx.store.log({
    stage: 'gate', level: outcome.outcome === 'drop' ? 'warn' : 'info',
    msg: `${outcome.rule} → ${outcome.outcome}`, dedupeHash: row.dedupeHash, latencyMs: null,
    meta: { claimId: row.id, claimType: row.claimType, tier: row.sourceTier, domain: row.sourceDomain, reason: outcome.reason },
  });
  return outcome;
}
