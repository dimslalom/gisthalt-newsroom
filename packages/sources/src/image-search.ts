/**
 * Fallback art for a prose claim whose source article carried no image of its
 * own (confirmed real for at least racefans.net — some feeds simply never
 * embed one). Google's Custom Search JSON API is the only sanctioned way to
 * do this progammatically; a raw Google Images scrape is against their ToS
 * and would break the same way OpenF1/Reddit scraping already has this
 * session. No key configured -> silently no-ops, same pattern as every other
 * optional source in this package.
 *
 * Never trusted as-is: a search result is not a licensed image. This is why
 * the claim it's attached to still goes through the normal review gate
 * rather than being wired into an auto-publish path.
 */
export async function fetchFallbackImage(query: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx || !query.trim()) return null;
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&searchType=image&num=1&safe=active&q=${encodeURIComponent(query)}`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { link?: string }[] };
    return data.items?.[0]?.link ?? null;
  } catch {
    return null;
  }
}
