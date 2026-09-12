import type { PollContext, RawItem, SourceAdapter } from '@newsroom/core';
import { getJson } from './http.ts';

const BASE = 'https://api.jolpi.ca/ergast/f1';

interface StandingsResponse {
  MRData: {
    StandingsTable: {
      season: string; round: string;
      StandingsLists: {
        season: string; round: string;
        DriverStandings?: {
          position: string; points: string; wins: string;
          Driver: { givenName: string; familyName: string; code?: string };
          Constructors: { name: string }[];
        }[];
        ConstructorStandings?: {
          position: string; points: string; wins: string; Constructor: { name: string };
        }[];
      }[];
    };
  };
}

/** Tier A. Championship standings, which OpenF1 does not carry. */
export const jolpica: SourceAdapter = {
  key: 'jolpica',
  vertical: 'f1',
  tier: 'A',
  cadence: () => 3600,

  async poll(ctx: PollContext): Promise<RawItem[]> {
    const out: RawItem[] = [];
    for (const kind of ['driverstandings', 'constructorstandings'] as const) {
      const data = await getJson<StandingsResponse>(`${BASE}/current/${kind}/?format=json`, ctx.fetch);
      const list = data.MRData.StandingsTable.StandingsLists[0];
      if (!list) continue;
      const rows = kind === 'driverstandings'
        ? (list.DriverStandings ?? []).map((d) => ({
            position: Number(d.position),
            driver: `${d.Driver.givenName} ${d.Driver.familyName}`,
            abbr: d.Driver.code ?? '',
            team: d.Constructors[0]?.name ?? null,
            points: Number(d.points),
            wins: Number(d.wins),
          }))
        : (list.ConstructorStandings ?? []).map((c) => ({
            position: Number(c.position),
            driver: c.Constructor.name,
            team: c.Constructor.name,
            points: Number(c.points),
            wins: Number(c.wins),
          }));
      if (rows.length === 0) continue;

      out.push({
        sourceKey: 'jolpica',
        externalId: `${kind}:${list.season}:${list.round}`,
        vertical: 'f1',
        tier: 'A',
        sourceDomain: 'api.jolpi.ca',
        rawUrl: `${BASE}/current/${kind}/`,
        title: kind === 'driverstandings'
          ? `Klasemen Pembalap ${list.season} — Ronde ${list.round}`
          : `Klasemen Konstruktor ${list.season} — Ronde ${list.round}`,
        body: '',
        observedAt: ctx.now,
        payload: {
          claimType: kind === 'driverstandings' ? 'standings' : 'constructor_standings',
          season: list.season,
          round: Number(list.round),
          rows,
        },
      });
    }
    return out;
  },
};
