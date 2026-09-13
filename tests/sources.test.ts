import {describe,it,expect,beforeEach,vi} from 'vitest';
import {parseVlrResults,normaliseSession,isNoResults,parseFeed,fia,redditAdapter,parseRedditAtom,blacktopLive} from '@newsroom/sources';
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

describe('reddit adapter — public Atom feed, no app approval required', () => {
  beforeEach(() => { vi.unstubAllEnvs(); });

  it('parses a link post, inferring the promoted URL from the thumbnail anchor', () => {
    const atom = `<feed><entry>
      <id>t3_p1</id>
      <title>Norris wins</title>
      <link href="https://www.reddit.com/r/formula1/comments/p1/norris_wins/" />
      <updated>2026-09-12T10:00:00+00:00</updated>
      <content type="html">&lt;table&gt; &lt;tr&gt;&lt;td&gt; &lt;a href=&quot;https://autosport.com/story&quot;&gt; &lt;img src=&quot;https://preview.redd.it/x.jpg&quot; /&gt; &lt;/a&gt; &lt;/td&gt;&lt;td&gt; &amp;#32; submitted by &lt;a href=&quot;https://www.reddit.com/user/x&quot;&gt; /u/x &lt;/a&gt; &lt;br/&gt; &lt;a href=&quot;https://autosport.com/story&quot;&gt;[link]&lt;/a&gt; &lt;a href=&quot;https://www.reddit.com/r/formula1/comments/p1/norris_wins/&quot;&gt;[comments]&lt;/a&gt; &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content>
    </entry></feed>`;
    expect(parseRedditAtom(atom)).toEqual([{
      id: 't3_p1', title: 'Norris wins',
      permalink: 'https://www.reddit.com/r/formula1/comments/p1/norris_wins/',
      publishedAt: '2026-09-12T10:00:00+00:00',
      promotes: 'https://autosport.com/story',
    }]);
  });

  it('treats a self/text post as promoting nothing', () => {
    const atom = `<feed><entry>
      <id>t3_p2</id>
      <title>Race thread</title>
      <link href="https://www.reddit.com/r/formula1/comments/p2/race_thread/" />
      <updated>2026-09-12T10:00:00+00:00</updated>
      <content type="html">&lt;!-- SC_OFF --&gt;&lt;div&gt;discuss here&lt;/div&gt;&lt;a href=&quot;https://www.reddit.com/r/formula1/comments/p2/race_thread/&quot;&gt;[comments]&lt;/a&gt;</content>
    </entry></feed>`;
    expect(parseRedditAtom(atom)[0]).toMatchObject({ promotes: null });
  });

  it('fetches the public per-subreddit Atom feed with no credentials', async () => {
    const calls: string[] = [];
    const fetchStub = async (url: string) => {
      calls.push(String(url));
      return new Response('<feed></feed>', { status: 200 });
    };
    const items = await redditAdapter('formula1', 'f1').poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(calls).toEqual(['https://www.reddit.com/r/formula1/new/.rss?limit=25']);
    expect(items).toEqual([]);
  });

  it('maps a parsed entry into a tier C RawItem keyed by the promoted domain', async () => {
    const atom = `<feed><entry>
      <id>t3_p1</id>
      <title>Norris wins</title>
      <link href="https://www.reddit.com/r/formula1/comments/p1/norris_wins/" />
      <updated>2026-09-12T10:00:00+00:00</updated>
      <content type="html">&lt;a href=&quot;https://autosport.com/story&quot;&gt;&lt;img src=&quot;x&quot;/&gt;&lt;/a&gt; &lt;a href=&quot;https://www.reddit.com/r/formula1/comments/p1/norris_wins/&quot;&gt;[comments]&lt;/a&gt;</content>
    </entry></feed>`;
    const fetchStub = async () => new Response(atom, { status: 200 });
    const items = await redditAdapter('formula1', 'f1').poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(items[0]).toMatchObject({ tier: 'C', sourceDomain: 'autosport.com', rawUrl: 'https://autosport.com/story', payload: { promotes: 'https://autosport.com/story' } });
  });
});

describe('blacktop live adapter — leader-change gating', () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv('BLACKTOP_API_KEY', 'test-key'); });

  const event = (sessionId: string, status = 'ongoing') => ({
    data: [{
      id: 'evt1', name: 'Spanish Grand Prix', dateStart: '2026-09-11', dateEnd: '2026-09-13', status: 'ongoing',
      location: { name: 'Barcelona', country: { name: 'Spain' } },
      schedule: [{ id: sessionId, name: 'Qualifying', type: 'qualifying', startTime: '', endTime: '', status }],
    }],
  });
  const timingWithLeader = (code: string) => ([
    { driverNumber: '1', driverCode: code, teamName: 'Team', teamColor: 'FF0000', position: 1, gapToLeader: null, bestLapTime: '1:32.079', numberOfLaps: 10, retired: false },
  ]);

  it('returns nothing without an API key', async () => {
    vi.stubEnv('BLACKTOP_API_KEY', '');
    const fetchStub = async () => { throw new Error('should not be called'); };
    expect(await blacktopLive.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} })).toEqual([]);
  });

  it('returns nothing when no session is ongoing', async () => {
    const fetchStub = async () => new Response(JSON.stringify(event('s-idle', 'scheduled')), { status: 200 });
    expect(await blacktopLive.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} })).toEqual([]);
  });

  it('emits once for the first observed leader, then nothing while unchanged', async () => {
    const sessionId = 's-first-' + Math.random();
    const fetchStub = async (url: string) => new Response(
      JSON.stringify(String(url).includes('/events') ? event(sessionId) : timingWithLeader('VER')),
      { status: 200 },
    );
    const first = await blacktopLive.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ tier: 'A', payload: { claimType: 'classification', live: true } });

    const second = await blacktopLive.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(second).toEqual([]);
  });

  it('emits again, with a distinct externalId, when the leader changes', async () => {
    const sessionId = 's-change-' + Math.random();
    let leader = 'VER';
    const fetchStub = async (url: string) => new Response(
      JSON.stringify(String(url).includes('/events') ? event(sessionId) : timingWithLeader(leader)),
      { status: 200 },
    );
    const first = await blacktopLive.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    leader = 'NOR';
    const second = await blacktopLive.poll({ now, cursor: null, fetch: fetchStub as typeof fetch, log: () => {} });
    expect(second).toHaveLength(1);
    expect(second[0]!.externalId).not.toBe(first[0]!.externalId);
    expect((second[0]!.payload.rows as { abbr: string }[])[0]!.abbr).toBe('NOR');
  });
});
