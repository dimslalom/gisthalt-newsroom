import type { PollContext, RawItem, SourceAdapter } from '@newsroom/core';
import { getJson } from './http.ts';

const BASE = 'https://api.openf1.org/v1';

export interface OpenF1Session {
  session_key: number; meeting_key: number; session_name: string; session_type: string;
  date_start: string; date_end: string; country_name: string; circuit_short_name: string;
  location: string; year: number;
}
export interface OpenF1Driver {
  driver_number: number; name_acronym: string; first_name: string; last_name: string;
  full_name: string; team_name: string; team_colour: string; headshot_url: string | null;
}
export interface OpenF1Result {
  position: number | null; driver_number: number; duration: number | number[] | null;
  gap_to_leader: number | string | null; number_of_laps: number | null; dnf?: boolean; dns?: boolean; dsq?: boolean;
}

/** OpenF1 returns {"detail":"No results found."} before a session completes,
 *  not an empty array. Handle the shape, not just the emptiness. */
export function isNoResults(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload) && 'detail' in (payload as object) && /no results found/i.test(String((payload as { detail: unknown }).detail)));
}

const flatten = (d: OpenF1Result['duration']): number | null =>
  Array.isArray(d) ? (d.findLast((x) => typeof x === 'number' && Number.isFinite(x)) ?? null) : d;

export function statusOf(r: OpenF1Result): string | null {
  if (r.dsq) return 'DSQ';
  if (r.dnf) return 'DNF';
  if (r.dns) return 'DNS';
  return null;
}

/** Tier A. Structured truth: no model is ever consulted for these values. */
export const openf1: SourceAdapter = {
  key: 'openf1',
  vertical: 'f1',
  tier: 'A',
  /** 15s inside a live window, 10 minutes otherwise. */
  cadence: () => (process.env.LIVE_WINDOW === '1' ? 15 : 600),

  async poll(ctx: PollContext): Promise<RawItem[]> {
    const year = ctx.now.getUTCFullYear();
    const sessions = await getJson<OpenF1Session[] | { detail: string }>(`${BASE}/sessions?year=${year}`, ctx.fetch);
    if (isNoResults(sessions)) return [];
    if (!Array.isArray(sessions)) throw new Error('OpenF1 sessions response was not an array');

    // Only sessions that have already ended can produce a result claim.
    const ended = sessions
      .filter((s) => Date.parse(s.date_end) <= ctx.now.getTime())
      .sort((a, b) => Date.parse(b.date_end) - Date.parse(a.date_end))
      .slice(0, 2);

    const out: RawItem[] = [];
    const upcoming = sessions.filter(s=>Date.parse(s.date_start)>ctx.now.getTime()).sort((a,b)=>Date.parse(a.date_start)-Date.parse(b.date_start));
    const meeting = upcoming[0];
    if (meeting) out.push({ sourceKey:'openf1', externalId:`schedule:${meeting.meeting_key}`, vertical:'f1', tier:'A', sourceDomain:'api.openf1.org', rawUrl:`${BASE}/sessions?meeting_key=${meeting.meeting_key}`, title:`Jadwal ${meeting.location}`, body:'', observedAt:ctx.now,
      payload:{claimType:'schedule',meeting:meeting.location,sessions:upcoming.filter(s=>s.meeting_key===meeting.meeting_key).map(s=>({name:s.session_name,startsAt:s.date_start,day:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',weekday:'long'}).format(new Date(s.date_start))}))} });
    for (const session of ended) {
      const [results, drivers] = await Promise.all([
        getJson<OpenF1Result[] | { detail: string }>(`${BASE}/session_result?session_key=${session.session_key}`, ctx.fetch),
        getJson<OpenF1Driver[] | { detail: string }>(`${BASE}/drivers?session_key=${session.session_key}`, ctx.fetch),
      ]);
      if (isNoResults(results) || (Array.isArray(results) && results.length === 0)) {
        ctx.log('openf1: session_result not published yet', { session: session.session_key });
        continue;
      }
      if (!Array.isArray(results)) throw new Error('OpenF1 results response was not an array');
      const byNumber = new Map<number, OpenF1Driver>(
        (Array.isArray(drivers) ? drivers : []).map((d) => [d.driver_number, d]),
      );
      out.push(normaliseSession(session, results, byNumber, ctx.now));
    }
    return out;
  },
};

export function normaliseSession(
  session: OpenF1Session,
  results: OpenF1Result[],
  byNumber: Map<number, OpenF1Driver>,
  now: Date,
): RawItem {
  const rows = [...results]
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((r) => {
      const d = byNumber.get(r.driver_number);
      return {
        position: r.position,
        driver: d?.full_name ?? `#${r.driver_number}`,
        abbr: d?.name_acronym ?? String(r.driver_number),
        team: d?.team_name ?? null,
        teamColour: d?.team_colour ? `#${d.team_colour.replace('#', '')}` : null,
        duration: flatten(r.duration),
        gap: r.gap_to_leader,
        laps: r.number_of_laps,
        status: statusOf(r),
      };
    });

  return {
    sourceKey: 'openf1',
    externalId: `session_result:${session.session_key}`,
    vertical: 'f1',
    tier: 'A',
    sourceDomain: 'api.openf1.org',
    rawUrl: `https://api.openf1.org/v1/session_result?session_key=${session.session_key}`,
    title: `${session.session_name} - ${session.location} ${session.year}`,
    body: '',
    observedAt: new Date(session.date_end),
    payload: {
      claimType: 'classification',
      session: session.session_name,
      sessionType: session.session_type,
      meeting: `${session.country_name} GP`,
      circuit: session.circuit_short_name,
      year: session.year,
      rows,
    },
  };
}
