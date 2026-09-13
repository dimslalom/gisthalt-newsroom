import { load } from 'cheerio';
import type { RawItem, SourceAdapter } from '@newsroom/core';
import { getText } from './http.ts';
export function parseVlrResults(html: string, now: Date): RawItem[] {
  const $ = load(html); const cards = $('a.match-item');
  if (!cards.length) throw new Error('VLR parser: result cards missing; inspect source markup');
  return cards.toArray().slice(0,20).map((el) => {
    const card = $(el); const href = card.attr('href');
    const names = card.find('.match-item-vs-team-name').map((_,e) => $(e).text().replace(/\s+/g,' ').trim()).get();
    const scores = card.find('.match-item-vs-team-score').map((_,e) => $(e).text().trim()).get();
    const event = card.find('.match-item-event').text().replace(/\s+/g,' ').trim();
    const eventId = href?.match(/^\/(\d+)\//)?.[1];
    if (!eventId || names.length !== 2 || scores.length !== 2 || scores.some((s)=>!/^\d+$/.test(s)) || names.some((s)=>!s) || !/Completed/i.test(card.find('.ml-status').text())) throw new Error('VLR parser: incomplete completed-match fields');
    const team1=names[0]!, team2=names[1]!, score1=Number(scores[0]), score2=Number(scores[1]);
    return { sourceKey:'vlr', externalId:eventId, vertical:'vct', tier:'A', sourceDomain:'vlr.gg', rawUrl:`https://www.vlr.gg${href}`,
      title:`${team1} ${score1}-${score2} ${team2}`, body:'', observedAt:now,
      payload:{claimType:'match_result',team1,team2,score1,score2,eventId,tournament:event} };
  });
}
export const vlr: SourceAdapter = { key:'vlr', vertical:'vct', tier:'A', cadence:()=>120,
  async poll(ctx) { return parseVlrResults(await getText('https://www.vlr.gg/matches/results',ctx.fetch),ctx.now); } };
