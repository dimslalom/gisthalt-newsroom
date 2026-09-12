import type { PollContext, RawItem, SourceAdapter, Tier, Vertical } from '@newsroom/core';
import { domainOf, getText } from './http.ts';

/** Deliberately small: enough for well-formed RSS/Atom, no dependency. */
export function parseFeed(xml: string): { title: string; link: string; id: string; date: string | null; summary: string; image: string | null }[] {
  const entries = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  return entries.map((e) => {
    const pick = (tag: string): string | null => {
      const m = e.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? clean(m[1]!) : null;
    };
    const linkAttr = e.match(/<link\b[^>]*href="([^"]+)"/i)?.[1];
    const link = linkAttr ?? pick('link') ?? '';
    const image = e.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*url="([^"]+)"/i)?.[1]
      ?? e.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null;
    return {
      title: pick('title') ?? '',
      link,
      id: pick('guid') ?? pick('id') ?? link,
      date: pick('pubDate') ?? pick('updated') ?? pick('published'),
      summary: (pick('description') ?? pick('summary') ?? pick('content') ?? '').slice(0, 4000),
      image,
    };
  });
}

function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (match, code: string) => { const n=code[0]!.toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code); return n>0 && n<=0x10ffff?String.fromCodePoint(n):match; })
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RssConfig {
  key: string; url: string; vertical: Vertical; tier: Tier; cadenceSeconds?: number;
}

export function rssAdapter(cfg: RssConfig): SourceAdapter {
  return {
    key: cfg.key,
    vertical: cfg.vertical,
    tier: cfg.tier,
    cadence: () => cfg.cadenceSeconds ?? 300,
    async poll(ctx: PollContext): Promise<RawItem[]> {
      const xml = await getText(cfg.url, ctx.fetch);
      return parseFeed(xml).slice(0, 20).map((e) => ({
        sourceKey: cfg.key,
        externalId: e.id || e.link,
        vertical: cfg.vertical,
        tier: cfg.tier,
        sourceDomain: domainOf(e.link) || domainOf(cfg.url),
        rawUrl: e.link || null,
        title: e.title,
        body: e.summary,
        imageUrl: e.image,
        observedAt: e.date && !Number.isNaN(Date.parse(e.date)) ? new Date(e.date) : ctx.now,
        payload: { claimType: 'article', feed: cfg.key },
      }));
    },
  };
}

/** The tier B allowlist as feeds. Prose, so every claim needs a supporting quote. */
export const F1_FEEDS: RssConfig[] = [
  { key: 'rss:formula1', url: 'https://www.formula1.com/en/latest/all.xml', vertical: 'f1', tier: 'B' },
  { key: 'rss:autosport', url: 'https://www.autosport.com/rss/f1/news/', vertical: 'f1', tier: 'B' },
  { key: 'rss:motorsport', url: 'https://www.motorsport.com/rss/f1/news/', vertical: 'f1', tier: 'B' },
  { key: 'rss:racefans', url: 'https://www.racefans.net/feed/', vertical: 'f1', tier: 'B' },
];
