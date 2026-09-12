import type { PollContext, RawItem, SourceAdapter, Vertical } from '@newsroom/core';
import { domainOf, getJson, UA } from './http.ts';

interface RedditListing {
  data: { children: { data: {
    id: string; title: string; selftext: string; url: string; permalink: string;
    created_utc: number; domain: string; score: number; num_comments: number;
    link_flair_text: string | null; thumbnail: string | null;
  } }[] };
}

interface TokenResponse { access_token: string; expires_in: number; token_type: string }

/**
 * Reddit blocks the unauthenticated www.reddit.com/*.json endpoint from most
 * non-browser callers regardless of User-Agent. The documented, reliable path
 * is OAuth2 client-credentials ("script app") auth against oauth.reddit.com,
 * which needs only REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET — no user login.
 * Falls back to the public endpoint (best-effort, likely 403) when unset.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Test-only: the module-level cache would otherwise leak between test cases. */
export function resetRedditTokenCache(): void { cachedToken = null; }

async function getAccessToken(fetchImpl: typeof fetch): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`reddit oauth token: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as TokenResponse;
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

async function fetchListing(subreddit: string, ctx: PollContext): Promise<RedditListing> {
  const token = await getAccessToken(ctx.fetch);
  if (token) {
    const res = await ctx.fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=25`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': UA },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for oauth.reddit.com/r/${subreddit}`);
    return (await res.json()) as RedditListing;
  }
  // No credentials configured: best-effort public endpoint, documented to be
  // unreliable from server IPs. Tier C only, so a failure here drops nothing
  // that could otherwise auto-publish.
  return getJson<RedditListing>(`https://www.reddit.com/r/${subreddit}/new.json?limit=25`, ctx.fetch);
}

/**
 * Tier C. Signals only. A tier C item can only become a post by promoting the
 * primary source it links to, which is then evaluated on its own merits.
 */
export function redditAdapter(subreddit: string, vertical: Vertical): SourceAdapter {
  return {
    key: `reddit:${subreddit}`,
    vertical,
    tier: 'C',
    cadence: () => 180,
    async poll(ctx: PollContext): Promise<RawItem[]> {
      const data = await fetchListing(subreddit, ctx);
      return data.data.children.map((c) => c.data).map((p) => ({
        sourceKey: `reddit:${subreddit}`,
        externalId: p.id,
        vertical,
        tier: 'C' as const,
        // The domain that matters is the one being linked to, not reddit.com.
        sourceDomain: p.domain?.startsWith('self.') ? 'reddit.com' : (p.domain || domainOf(p.url)),
        rawUrl: p.url?.startsWith('http') ? p.url : `https://reddit.com${p.permalink}`,
        title: p.title,
        body: p.selftext ?? '',
        observedAt: new Date(p.created_utc * 1000),
        payload: {
          claimType: 'signal',
          subreddit,
          score: p.score,
          comments: p.num_comments,
          flair: p.link_flair_text,
          /** The link the signal points at. Promotion candidate. */
          promotes: p.domain?.startsWith('self.') ? null : p.url,
        },
      }));
    },
  };
}
