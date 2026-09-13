import type { PollContext, RawItem, SourceAdapter, Vertical } from '@newsroom/core';
import { domainOf, UA } from './http.ts';

/**
 * Both Reddit's OAuth API and the unauthenticated www.reddit.com/*.json
 * endpoint require a registered, approved app under Reddit's 2026
 * Responsible Builder Policy — self-service app creation is closed and
 * approval is a manual, unbounded-wait process. The public Atom feed
 * (reddit.com/r/<sub>/new/.rss) is not behind that gate and needs no
 * credentials. Trade-off: the feed exposes no score/comment counts, and the
 * linked-to URL (for link posts) has to be inferred from the entry's HTML
 * body rather than read off a dedicated field.
 *
 * The unauthenticated bucket is tiny (observed: `x-ratelimit-remaining: 0.0`
 * after a single request) and shared across the whole reddit.com domain, not
 * per subreddit — four subreddit adapters polling in the same tick will 429
 * each other. fetchAtomRateLimited serializes every call across all
 * redditAdapter instances in this process and paces them using Reddit's own
 * `x-ratelimit-reset` header instead of a guessed fixed delay.
 */

let readyAt = 0;
let queue: Promise<unknown> = Promise.resolve();

async function fetchAtomRateLimited(subreddit: string, fetchImpl: typeof fetch): Promise<string> {
  const url = `https://www.reddit.com/r/${subreddit}/new/.rss?limit=25`;

  const attempt = async (): Promise<Response> => {
    const wait = readyAt - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const res = await fetchImpl(url, { headers: { 'user-agent': UA } });
    const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '1');
    // A small buffer over Reddit's own reset countdown absorbs clock/network
    // jitter between when it stamped the header and when we act on it.
    const resetSeconds = Number(res.headers.get('x-ratelimit-reset') ?? '1') + 2;
    readyAt = Date.now() + (remaining > 0 ? 1 : Math.max(resetSeconds, 1)) * 1000;
    return res;
  };

  const run = async (): Promise<string> => {
    let res = await attempt();
    // The bucket resets quickly (seconds), so one retry in-line is cheap and
    // saves this source from sitting out a full 180s cadence for a blip.
    if (res.status === 429) res = await attempt();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.text();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

interface RedditEntry {
  id: string;
  title: string;
  permalink: string;
  publishedAt: string | null;
  /** The external URL a link post points to, or null for a self/text post. */
  promotes: string | null;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Deliberately small: Reddit's Atom feed shape only, no dependency. */
export function parseRedditAtom(atom: string): RedditEntry[] {
  const blocks = [...atom.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map((m) => m[0]);
  return blocks.map((e) => {
    const title = decode(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const id = e.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '';
    const permalink = e.match(/<link href="([^"]+)"/)?.[1] ?? '';
    const publishedAt = e.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ?? null;
    const content = decode(e.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1] ?? '');
    // The thumbnail anchor wraps the post's own target (the external link for
    // a link post, an i.redd.it/external-preview URL for an image post); the
    // final href in the body is always the reddit permalink itself.
    const hrefs = [...content.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    const first = hrefs.find((h) => h.startsWith('http')) ?? null;
    const promotes = first && first !== permalink && !first.includes('/comments/') ? first : null;
    return { id: id || permalink, title, permalink, publishedAt, promotes };
  });
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
      const atom = await fetchAtomRateLimited(subreddit, ctx.fetch);
      return parseRedditAtom(atom).map((entry) => ({
        sourceKey: `reddit:${subreddit}`,
        externalId: entry.id,
        vertical,
        tier: 'C' as const,
        sourceDomain: entry.promotes ? domainOf(entry.promotes) : 'reddit.com',
        rawUrl: entry.promotes ?? entry.permalink,
        title: entry.title,
        body: '',
        observedAt: entry.publishedAt && !Number.isNaN(Date.parse(entry.publishedAt)) ? new Date(entry.publishedAt) : ctx.now,
        payload: {
          claimType: 'signal',
          subreddit,
          /** The link the signal points at. Promotion candidate. */
          promotes: entry.promotes,
        },
      }));
    },
  };
}
