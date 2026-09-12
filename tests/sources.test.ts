import {describe,it,expect,beforeEach,vi} from 'vitest';
import {parseVlrResults,normaliseSession,isNoResults,parseFeed,fia,redditAdapter,resetRedditTokenCache} from '@newsroom/sources';
import {brandByKey} from '@newsroom/brands';
const now=new Date('2026-09-12T12:00:00Z');
describe('source normalization',()=>{
  it('decodes numeric feed entities before dedupe and display',()=>{
    const feed=parseFeed('<rss><item><title>F1&#8217;s &#x201C;Madrid&#x201D;</title><link>https://example.com/story</link></item></rss>');
    expect(feed[0]!.title).toBe('F1’s “Madrid”');
  });
  it('keeps PDF-only document links distinct when anchor labels are empty',async()=>{
    const html='<a href="/system/files/decision_1.pdf"><span></span></a><a href="/system/files/decision_2.pdf"><span>Decision two</span></a>';
    const rows=await fia.poll({now,cursor:null,fetch:async()=>new Response(html),log:()=>{}});
    expect(rows.map(r=>r.title)).toEqual(['decision 1','Decision two']);
    expect(rows[0]!.rawUrl).toBe('https://www.fia.com/system/files/decision_1.pdf');
  });

  it('distinguishes a pending result from an API error',()=>{expect(isNoResults({detail:'No results found.'})).toBe(true);expect(isNoResults({detail:'Rate limit exceeded'})).toBe(false);});
  it('fails loudly when VLR markup changes',()=>{expect(()=>parseVlrResults('<main>Something changed</main>',now)).toThrow('cards missing');});
  it('parses completed matches with validated names and scores',()=>{
    const html='<a class="match-item" href="/123/a-vs-b"><div class="match-item-vs-team-name">A</div><div class="match-item-vs-team-name">B</div><div class="match-item-vs-team-score">2</div><div class="match-item-vs-team-score">1</div><div class="match-item-event">VCT</div><div class="ml-status">Completed</div></a>';
    expect(parseVlrResults(html,now)[0]!.payload).toMatchObject({team1:'A',team2:'B',score1:2,score2:1,eventId:'123'});
    expect(()=>parseVlrResults(html.replace('>2<','>TBD<'),now)).toThrow('incomplete');
  });
  it('prints Jakarta time rather than labelling UTC as WIB',()=>{
    const model=brandByKey('f1').archetypes.find(a=>a.key==='schedule')!.model({vertical:'f1',claimType:'schedule',entities:{meeting:'Madrid'},values:{sessions:[{name:'Race',startsAt:'2026-09-13T13:00:00Z'}]},sourceTier:'A',sourceDomain:'api.openf1.org',supportingQuote:null,observedAt:now});
    expect(model.rows?.[0]?.value).toBe('20:00');
  });
});

describe('reddit adapter — OAuth over the blocked public endpoint', () => {
  beforeEach(() => { vi.unstubAllEnvs(); resetRedditTokenCache(); });

  it('falls back to the public endpoint when no app credentials are configured', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', ''); vi.stubEnv('REDDIT_CLIENT_SECRET', '');
    const calls: string[] = [];
    const fetchStub = async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: { children: [] } }), { status: 200 });
    };
    await redditAdapter('formula1', 'f1').poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(calls).toEqual(['https://www.reddit.com/r/formula1/new.json?limit=25']);
  });

  it('trades client-credentials for a bearer token and calls oauth.reddit.com once configured', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id123'); vi.stubEnv('REDDIT_CLIENT_SECRET', 'secret456');
    const calls: string[] = [];
    const fetchStub = async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes('access_token')) {
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Basic /);
        return new Response(JSON.stringify({ access_token: 'tok-abc', expires_in: 3600, token_type: 'bearer' }), { status: 200 });
      }
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok-abc');
      return new Response(JSON.stringify({
        data: { children: [{ data: {
          id: 'p1', title: 'Norris wins', selftext: '', url: 'https://autosport.com/story', permalink: '/r/formula1/p1',
          created_utc: 1_700_000_000, domain: 'autosport.com', score: 10, num_comments: 2, link_flair_text: null, thumbnail: null,
        } }] },
      }), { status: 200 });
    };
    const items = await redditAdapter('formula1', 'f1').poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(calls).toEqual(['https://www.reddit.com/api/v1/access_token', 'https://oauth.reddit.com/r/formula1/new?limit=25']);
    expect(items[0]).toMatchObject({ sourceDomain: 'autosport.com', payload: { promotes: 'https://autosport.com/story' } });
  });

  it('reuses a cached token across two polls instead of re-authenticating', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id123'); vi.stubEnv('REDDIT_CLIENT_SECRET', 'secret456');
    let tokenCalls = 0;
    const fetchStub = async (url: string) => {
      if (String(url).includes('access_token')) {
        tokenCalls += 1;
        return new Response(JSON.stringify({ access_token: 'tok-xyz', expires_in: 3600, token_type: 'bearer' }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { children: [] } }), { status: 200 });
    };
    const adapter = redditAdapter('movies', 'film');
    await adapter.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    await adapter.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(tokenCalls).toBe(1);
  });
});
