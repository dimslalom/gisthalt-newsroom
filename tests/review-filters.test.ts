import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterReviews } from '../apps/dashboard/app/review/filters.ts';
const items = [
  { vertical: 'f1', state: 'pending', claimType: 'session_result', tier: 'B', domain: 'autosport.com', headline: 'Madrid qualifying', reason: 'quote needed' },
  { vertical: 'film', state: 'held', claimType: 'release', tier: 'A', domain: 'tmdb.org', headline: 'New film', reason: 'second source' },
  { vertical: 'f1', state: 'expired', claimType: 'article', tier: 'B', domain: 'formula1.com', headline: 'Madrid preview', reason: 'review needed' },
];
describe('review queue filters', () => {
  it('defaults to incoming pending and held reviews', () => { expect(filterReviews(items, DEFAULT_FILTERS)).toEqual(items.slice(0, 2)); });
  it('combines brand, content type, tier, source and case-insensitive search', () => {
    expect(filterReviews(items, { ...DEFAULT_FILTERS, vertical: 'f1', type: 'session_result', tier: 'B', domain: 'autosport.com', search: ' MADRID ' })).toEqual([items[0]]);
  });
  it('allows expired browsing without treating those items as incoming', () => {
    expect(filterReviews(items, { ...DEFAULT_FILTERS, vertical: 'f1', status: 'expired' })).toEqual([items[2]]);
    expect(filterReviews(items, { ...DEFAULT_FILTERS, status: 'all' })).toHaveLength(3);
    expect(filterReviews(items, { ...DEFAULT_FILTERS, search: 'nothing here' })).toHaveLength(0);
  });
});
