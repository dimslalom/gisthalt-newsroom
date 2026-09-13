import { vlr } from './vlr.ts';
import { tmdb } from './tmdb.ts';
import type { SourceAdapter } from '@newsroom/core';
import { fia } from './fia.ts';
import { jolpica } from './jolpica.ts';
import { openf1 } from './openf1.ts';
import { blacktopLive } from './blacktop.ts';
import { redditAdapter } from './reddit.ts';
import { F1_FEEDS, rssAdapter } from './rss.ts';

/** Every adapter the pipeline knows about. Brands add rows here, not code in apps/. */
export const adapters: SourceAdapter[] = [
  openf1,
  blacktopLive,
  jolpica,
  fia,
  ...F1_FEEDS.map(rssAdapter),
  redditAdapter('formula1', 'f1'), vlr, tmdb,
  redditAdapter('VALORANTCompetitive','vct'), redditAdapter('movies','film'), redditAdapter('television','film'),
  rssAdapter({key:'rss:deadline',url:'https://deadline.com/feed/',vertical:'film',tier:'B'}),
  rssAdapter({key:'rss:variety',url:'https://variety.com/feed/',vertical:'film',tier:'B'}),
  // dotesports.com sits behind a Cloudflare JS challenge (cf-mitigated: challenge) that
  // returns 403 to any non-browser client; pcgamesn's Valorant feed is unobstructed.
  rssAdapter({key:'rss:pcgamesn-valorant',url:'https://www.pcgamesn.com/valorant/feed',vertical:'vct',tier:'B'}),
];

export const adapterByKey = (key: string): SourceAdapter | undefined => adapters.find((a) => a.key === key);
