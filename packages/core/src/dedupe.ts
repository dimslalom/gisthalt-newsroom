import { createHash } from 'node:crypto';
import type { Claim, RawItem } from './contracts.ts';

const normaliseString = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Numbers round to 3dp so +0.1130001 and +0.113 are the same claim. */
const normaliseValue = (v: unknown): string => {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(normaliseValue).join('|');
  if (typeof v === 'object') return stableEntries(v as Record<string, unknown>);
  return normaliseString(String(v));
};

const stableEntries = (o: Record<string, unknown>): string =>
  Object.keys(o).sort().map((k) => `${normaliseString(k)}=${normaliseValue(o[k])}`).join(';');

/**
 * dedupeHash = sha256(vertical + claimType + normalisedEntities + normalisedValues).
 * Deliberately excludes source, domain and time: the same fact from four outlets
 * must collapse to one hash so it costs at most one model call.
 */
export function dedupeHash(claim: Pick<Claim, 'vertical' | 'claimType' | 'entities' | 'values'>): string {
  const parts = [
    claim.vertical,
    normaliseString(claim.claimType),
    stableEntries(claim.entities),
    stableEntries(claim.values),
  ].join('\n');
  return createHash('sha256').update(parts).digest('hex');
}

/** Content hash of a raw item, so re-polling the same article is free. */
export function contentHash(item: Pick<RawItem, 'sourceKey' | 'externalId' | 'title' | 'body'> & { payload?: Record<string, unknown> }): string {
  return createHash('sha256')
    .update([item.sourceKey, item.externalId, normaliseString(item.title), normaliseString(item.body), item.payload ? stableEntries(item.payload) : ''].join('\n'))
    .digest('hex');
}

/**
 * Pre-extraction dedupe key. Structured sources carry a real externalId;
 * prose items collapse on a normalised title so the same wire story from
 * four outlets is recognised BEFORE we pay for an extraction.
 */
export function preExtractionKey(item: RawItem): string {
  const basis = item.tier === 'A'
    ? `${item.sourceKey}:${item.externalId}`
    : `${item.vertical}:${normaliseString(item.title).split(' ').slice(0, 12).join(' ')}`;
  return createHash('sha256').update(basis).digest('hex');
}
