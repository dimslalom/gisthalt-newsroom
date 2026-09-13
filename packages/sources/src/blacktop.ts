import type { PollContext, RawItem, SourceAdapter } from '@newsroom/core';

/**
 * Fills the one gap openf1 can't: live, in-session timing. OpenF1's free tier
 * (openf1.ts) already covers schedule and final results before/after a
 * session for free — this adapter's only job is the window while a session
 * is actually live, via Orange Cat Blacktop's paid real-time tier
 * (https://ocblacktop.com/api, Hobby plan or above).
 *
 * Scope is deliberately narrow: emit a claim only when the session leader
 * changes, never on every poll. The pipeline's `classification` claim type
 * (see claims.ts) was built for one-shot final results, not a ticking feed —
 * polling every ~30s for a 1-2 hour session and emitting every time would
 * flood Review with near-duplicate claims (and duplicate `topResultClaim`
 * leader posts) for a session openf1 will report on properly once it ends.
 */

const BASE = 'https://api.ocblacktop.com/v1/formula1';

interface BlacktopSchedule {
  id: string; name: string; type: string; startTime: string; endTime: string; status: string;
}
interface BlacktopEvent {
  id: string; name: string; dateStart: string; dateEnd: string; status: string;
  location: { name: string; country: { name: string } };
  schedule: BlacktopSchedule[];
}
interface TimingDataRecord {
  driverNumber: string; driverCode: string | null; teamName: string | null; teamColor: string | null;
  position: number | null; gapToLeader: string | null; bestLapTime: string | null;
  numberOfLaps: number; retired: boolean;
}

/** "1:32.079" / "28.123" -> seconds. Blacktop's own format for every lap/sector time. */
function parseLapSeconds(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = s.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** sessionId -> the driverCode currently in P1 last time we looked, plus how
 * many times it has changed (kept in the RawItem's externalId so each change
 * is a genuinely new, non-deduped item). */
const lastLeader = new Map<string, { driverCode: string; changeIndex: number }>();

async function getJsonAuthed<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const key = process.env.BLACKTOP_API_KEY;
  const res = await fetchImpl(url, { headers: { 'x-api-key': key ?? '', accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

/** Tier A. Live-session leader changes only — final results stay openf1's job. */
export const blacktopLive: SourceAdapter = {
  key: 'blacktop-live',
  vertical: 'f1',
  tier: 'A',
  cadence: () => 45,

  async poll(ctx: PollContext): Promise<RawItem[]> {
    if (!process.env.BLACKTOP_API_KEY) return [];

    const year = ctx.now.getUTCFullYear();
    const { data: events } = await getJsonAuthed<{ data: BlacktopEvent[] }>(`${BASE}/events?year=${year}&limit=50`, ctx.fetch);
    const current = events.find((e) => e.status === 'ongoing');
    if (!current) return [];

    const ongoing = current.schedule.filter((s) => s.status === 'ongoing');
    const out: RawItem[] = [];

    for (const session of ongoing) {
      let rows: TimingDataRecord[];
      try {
        rows = await getJsonAuthed<TimingDataRecord[]>(`${BASE}/live/sessions/${session.id}/timing`, ctx.fetch);
      } catch (e) {
        ctx.log('blacktop-live: timing fetch failed', { session: session.id, error: (e as Error).message });
        continue;
      }
      const leader = rows.find((r) => r.position === 1);
      if (!leader?.driverCode) continue;

      const prev = lastLeader.get(session.id);
      if (prev?.driverCode === leader.driverCode) continue; // no change, nothing to say

      const changeIndex = (prev?.changeIndex ?? -1) + 1;
      lastLeader.set(session.id, { driverCode: leader.driverCode, changeIndex });

      out.push({
        sourceKey: 'blacktop-live',
        externalId: `${session.id}:leader:${changeIndex}`,
        vertical: 'f1',
        tier: 'A',
        sourceDomain: 'api.ocblacktop.com',
        rawUrl: `${BASE}/live/sessions/${session.id}/timing`,
        title: `Klasemen Sementara (Live) — ${current.location.name} ${session.name}`,
        body: '',
        observedAt: ctx.now,
        payload: {
          claimType: 'classification',
          meeting: `${current.location.name} GP`,
          session: session.name,
          live: true,
          rows: [...rows]
            .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
            .map((r) => ({
              position: r.position,
              driver: r.driverCode ?? `#${r.driverNumber}`,
              abbr: r.driverCode ?? String(r.driverNumber),
              team: r.teamName,
              teamColour: r.teamColor ? `#${r.teamColor.replace('#', '')}` : null,
              duration: parseLapSeconds(r.bestLapTime),
              gap: r.gapToLeader,
              laps: r.numberOfLaps,
              status: r.retired ? 'DNF' : null,
            })),
        },
      });
    }
    return out;
  },
};
