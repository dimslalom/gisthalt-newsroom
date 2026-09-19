import { brandForVertical } from '@newsroom/brands';
import { dedupeHash, contentHash, preExtractionKey } from '@newsroom/core';
import type { Claim, RawItem } from '@newsroom/core';
import type { ClaimRow, ItemRow } from '@newsroom/db';
import { EXTRACTION_CLAIM_TYPES, extractClaim, validateQuote } from '@newsroom/llm';
import type { Brand } from '@newsroom/design';
import { structuredClaim, topResultClaim, promotePrimary, fetchFallbackImage } from '@newsroom/sources';
import type { Ctx } from '../context.ts';

export const toRawItem = (row: ItemRow): RawItem => ({
  sourceKey: row.sourceKey, externalId: row.externalId, vertical: row.vertical, tier: row.tier,
  sourceDomain: row.sourceDomain, rawUrl: row.rawUrl, title: row.title, body: row.body,
  payload: row.payload, observedAt: row.observedAt, imageUrl: row.imageUrl,
});

/** True when some archetype of the brand can render this claim type. */
export const brandRendersClaimType = (brand: Brand, claimType: string): boolean =>
  brand.archetypes.some((a) => a.claimTypes.includes(claimType));

/**
 * The claim type a brand can compose. A type no archetype of the brand lists
 * (the model calling an F1 story a 'release', say) would throw NoArchetypeError
 * at compose/review on every retry, so it becomes 'article', which every
 * brand's quote-style archetype accepts.
 */
export const renderableClaimType = (brand: Brand, claimType: string): string =>
  brandRendersClaimType(brand, claimType) ? claimType : 'article';

export interface ExtractSummary { itemId: string; claims: number; modelCalls: number; violation: string | null }

/**
 * Stage 2. Structured items become claims with zero model calls. Prose items go
 * to Flash-Lite, and every numeric value it returns must come with a quote that
 * literally contains it — validated here, not trusted.
 */
export async function extractItem(ctx: Ctx, row: ItemRow): Promise<ExtractSummary> {
  if (ctx.store.extractions.some((e) => e.itemId === row.id)) return { itemId: row.id, claims: 0, modelCalls: 0, violation: null };
  const mark = () => {
    ctx.store.extractions.push({ id: row.id, itemId: row.id, processedAt: ctx.now(), claimIds: ctx.store.evidence.filter((e) => e.itemId === row.id).map((e) => ctx.store.claims.find((c) => c.dedupeHash === e.dedupeHash)!.id) });
    ctx.store.save();
  };
  const item = toRawItem(row);
  const produced: Claim[] = [];
  let modelCalls = 0;
  let violation: string | null = null;

  if (item.tier === 'A' && item.payload.claimType && item.payload.claimType !== 'document') {
    const claim = structuredClaim(item);
    produced.push(claim);
    // A classification also yields the single-driver headline post.
    const top = claim.claimType === 'classification' ? topResultClaim(claim) : null;
    if (top) produced.push(top);
  } else if (item.tier === 'C') {
    // Tier C is a signal. It never becomes a claim of its own; it only promotes
    // the primary source it links to, which is then judged on its own merits.
    ctx.store.log({ stage: 'extract', level: 'info', msg: 'tier C signal held as a promotion candidate', dedupeHash: null, latencyMs: null, meta: { itemId: row.id, promotes: item.payload.promotes ?? null } });
    try {
      const primary = await promotePrimary(item, brandForVertical(item.vertical).tierBAllowlist);
      if (primary) ctx.store.insertItem({ ...primary, imageUrl: primary.imageUrl ?? null, fetchedAt: ctx.now(), contentHash: contentHash(primary), preKey: preExtractionKey(primary) });
    } catch (e) { ctx.store.log({stage:'extract',level:'warn',msg:'primary source promotion failed',dedupeHash:null,latencyMs:null,meta:{itemId:row.id,error:(e as Error).message}}); }
    mark();
    return { itemId: row.id, claims: 0, modelCalls: 0, violation: null };
  } else {
    // Reuse a paid extraction only for identical prose, never merely a similar
    // headline. Revalidate the quote against the second source and keep evidence.
    const twin = ctx.store.findRecentByPreKey(row.preKey, 45 * 60_000, ctx.now())
      .find((i) => i.id !== row.id && i.body === row.body && i.title === row.title && ctx.store.extractions.some((e) => e.itemId === i.id));
    const prior = twin && ctx.store.claims.find((c) => c.itemId === twin.id);
    if (prior && prior.sourceTier === row.tier) {
      violation = validateQuote(prior.supportingQuote, prior.values, `${item.title}\n${item.body}`);
      produced.push({ ...prior, sourceTier: row.tier, sourceDomain: row.sourceDomain, observedAt: row.observedAt, headline: prior.headline ?? undefined, imageUrl: row.imageUrl, supportingQuote: violation ? null : prior.supportingQuote });
    } else {
      try {
        const brand = brandForVertical(item.vertical);
        const claimTypes = EXTRACTION_CLAIM_TYPES.filter((t) => brandRendersClaimType(brand, t));
        const out = await extractClaim(ctx.router, item, { claimTypes });
        modelCalls = out.cached || out.model === 'none' ? 0 : 1;
        violation = out.quoteViolation;
        if (out.claim) produced.push(out.claim);
      } catch (error) {
        // A quota or malformed response degrades into an explicitly unextracted
        // review item. It never removes the source from the newsroom.
        violation = (error as Error).message;
        produced.push({ vertical: row.vertical, claimType: 'article', entities: { title: row.title }, values: {}, supportingQuote: null, sourceTier: row.tier === 'A' ? 'B' : row.tier, sourceDomain: row.sourceDomain, observedAt: row.observedAt, headline: row.title, imageUrl: item.imageUrl ?? null, tags: ['unextracted'] });
      }
    }
  }

  let created = 0;
  for (const claim of produced) {
    // Before hashing, so the dedupe hash matches what is stored and a second
    // outlet with the same fact still corroborates it.
    const renderable = renderableClaimType(brandForVertical(claim.vertical), claim.claimType);
    if (renderable !== claim.claimType) {
      ctx.store.log({ stage: 'extract', level: 'warn', msg: 'claim type has no archetype in its brand; stored as article', dedupeHash: null, latencyMs: null, meta: { itemId: row.id, claimType: claim.claimType, vertical: claim.vertical } });
      claim.claimType = renderable;
    }
    const hash = dedupeHash(claim);
    // Only worth spending a search-quota call on a claim that will actually
    // become a new row — upsertClaim keeps the existing row untouched on a
    // dedupe hit, so a duplicate story would just throw the result away.
    if (!claim.imageUrl && claim.sourceTier === 'B' && !ctx.store.claims.some((c) => c.dedupeHash === hash)) {
      claim.imageUrl = await fetchFallbackImage(claim.headline ?? item.title);
    }
    const { claim: row2, created: isNew } = ctx.store.upsertClaim({
      itemId: row.id,
      vertical: claim.vertical,
      claimType: claim.claimType,
      entities: claim.entities,
      values: claim.values,
      supportingQuote: claim.supportingQuote,
      headline: claim.headline ?? null,
      imageUrl: claim.imageUrl ?? null,
      tags: [...(claim.tags ?? []), ...(violation ? [`quote:${violation}`] : [])],
      sourceTier: claim.sourceTier,
      sourceDomain: claim.sourceDomain,
      extractedBy: item.tier === 'A' && item.payload.claimType !== 'document' ? 'structured' : 'gemini',
      dedupeHash: hash,
      observedAt: claim.observedAt,
      createdAt: ctx.now(),
    } satisfies Omit<ClaimRow, 'id'>);
    if (isNew) created += 1;
    ctx.store.log({
      stage: 'extract', level: 'info', msg: isNew ? 'claim created' : 'claim already known (dedupe hit)',
      dedupeHash: hash, latencyMs: null,
      meta: { itemId: row.id, claimId: row2.id, claimType: claim.claimType, modelCalls, violation },
    });
  }
  mark();
  return { itemId: row.id, claims: created, modelCalls, violation };
}
