import { load } from 'cheerio';
import { domainMatches, type RawItem } from '@newsroom/core';
/** Fetch the linked primary page; Reddit's title and comments are never evidence. */
export async function promotePrimary(item: RawItem, allowlist: string[], fetchImpl: typeof fetch = fetch): Promise<RawItem | null> {
  if (typeof item.payload.promotes !== 'string') return null;
  let url: URL;
  try { url = new URL(item.payload.promotes); } catch { return null; }
  const allowed = (u: URL) => u.protocol === 'https:' && !u.port && allowlist.some((d) => domainMatches(u.hostname,d));
  if (!allowed(url)) return null;
  let response: Response | undefined;
  for (let i=0;i<4;i++) {
    response = await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(response.status>=300&&response.status<400) { const next=response.headers.get('location'); if(!next)return null; url=new URL(next,url);if(!allowed(url))return null;continue; }
    break;
  }
  if(!response?.ok) throw new Error(`primary source returned ${response?.status}`);
  const $=load(await response.text()); $('script,style,nav,footer').remove();
  const title=$('meta[property="og:title"]').attr('content')??$('h1').first().text();
  const body=$('article').first().text().replace(/\s+/g,' ').trim().slice(0,12000);
  if(!title.trim()||body.length<80)throw new Error('primary source article text unavailable');
  return {sourceKey:`primary:${url.hostname}`,externalId:url.href,vertical:item.vertical,tier:'B',sourceDomain:url.hostname,rawUrl:url.href,title:title.trim(),body,observedAt:new Date(),payload:{claimType:'article',promotedFrom:item.rawUrl}};
}
