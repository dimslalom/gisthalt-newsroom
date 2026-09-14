export interface ReviewFilters { vertical: string; status: string; type: string; tier: string; domain: string; search: string }
export const DEFAULT_FILTERS: ReviewFilters = { vertical: 'all', status: 'active', type: 'all', tier: 'all', domain: 'all', search: '' };
export function filterReviews<T extends { vertical: string | null; state: string; claimType: string; tier: string; domain: string; headline: string; reason: string }>(items: T[], filters: ReviewFilters): T[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return items.filter((it) =>
    (filters.vertical === 'all' || it.vertical === filters.vertical) &&
    (filters.status === 'all' || (filters.status === 'active' ? ['pending', 'held'].includes(it.state) : it.state === filters.status)) &&
    (filters.type === 'all' || it.claimType === filters.type) &&
    (filters.tier === 'all' || it.tier === filters.tier) &&
    (filters.domain === 'all' || it.domain === filters.domain) &&
    (!search || `${it.headline} ${it.domain} ${it.claimType} ${it.reason}`.toLocaleLowerCase().includes(search)));
}
