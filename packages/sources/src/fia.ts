import { load } from 'cheerio';
import type { PollContext, RawItem, SourceAdapter } from '@newsroom/core';
import { getText } from './http.ts';

const INDEX = process.env.FIA_DOCUMENTS_URL ?? 'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2071';

/**
 * Tier A. FIA stewards' decision documents: penalties, which OpenF1 does not
 * carry. The published PDFs are the authoritative record; the MVP lists them
 * and hands the link on, it does not parse PDF text.
 */
export const fia: SourceAdapter = {
  key: 'fia',
  vertical: 'f1',
  tier: 'A',
  cadence: () => 300,

  async poll(ctx: PollContext): Promise<RawItem[]> {
    const html = await getText(INDEX, ctx.fetch);
    const $ = load(html);
    const links = $('a[href*="/system/files/"]').toArray().filter(el => /\.pdf(?:$|\?)/i.test($(el).attr('href') ?? '')).slice(0,15);
    if (!links.length) throw new Error('FIA parser found no PDF links; check FIA_DOCUMENTS_URL or parser markup');
    return links.map(el => {
      const href = $(el).attr('href')!;
      const title = $(el).text().replace(/\s+/g, ' ').trim() || decodeURIComponent(href.split('/').at(-1)!.split('?')[0]!).replace(/[_-]+/g, ' ').replace(/\.pdf$/i, '');
      return {
        sourceKey: 'fia',
        externalId: href!,
        vertical: 'f1' as const,
        tier: 'A' as const,
        sourceDomain: 'fia.com',
        rawUrl: new URL(href, 'https://www.fia.com').href,
        title,
        body: '',
        observedAt: ctx.now,
        payload: {
          // A decision document is a signal that a penalty exists; the values
          // are not machine-readable, so it lands in review by design (R4).
          claimType: 'document',
          documentType: /offence|penalty|decision/i.test(title) ? 'stewards_decision' : 'other',
        },
      };
    });
  },
};
