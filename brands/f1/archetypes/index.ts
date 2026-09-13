import { DASH, dateId, gap, lapTime, num, pos, text } from '@newsroom/core';
import type { Claim } from '@newsroom/core';
import type { Archetype, ArtModel, TableRow } from '@newsroom/design';
import { resolveEntity } from '../entities.ts';
import { meetingId, sessionId } from '../locale.id.ts';
import { RACE_RED } from '../skins.ts';

const s = (v: unknown): string => text(v == null ? null : String(v));
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface ResultRow {
  position?: number | null; driver?: string; abbr?: string; team?: string;
  duration?: number | null; gap?: number | string | null; laps?: number | null;
  points?: number | null; status?: string | null;
}

const rowsOf = (claim: Claim): ResultRow[] =>
  Array.isArray(claim.values.rows) ? (claim.values.rows as ResultRow[]) : [];

/**
 * The canvas is fixed, so the row count is too. Truncation is stated in the
 * table rather than clipped at the bottom edge, which is the failure the
 * data-extremes fixture exists to catch.
 */
function toTableRows(rows: ResultRow[], limit: number, mode: 'time' | 'points'): TableRow[] {
  const shown: TableRow[] = rows.slice(0, limit).map((r) => {
    const e = resolveEntity(r.team ?? null);
    return {
      rank: pos(r.position ?? null, r.status ?? null),
      primary: s(r.driver ?? r.abbr),
      secondary: s(r.team),
      value: mode === 'points' ? num(r.points ?? null) : lapTime(r.duration ?? null),
      trailing: mode === 'points' ? DASH : gap(r.gap ?? null, r.position ?? null),
      colour: e?.hex,
      onColour: e?.onColour,
    };
  });
  if (rows.length > limit) {
    shown.push({ rank: DASH, primary: `+${rows.length - limit} lainnya`, secondary: '', value: '', trailing: '' });
  }
  return shown;
}

/** Labels are localised at the edge, where the value is already confirmed. */
const meet = (claim: Claim): string => text(meetingId(claim.entities.meeting));
const sess = (claim: Claim): string => text(sessionId(claim.entities.session));

const meetingLine = (claim: Claim): string => {
  const parts = [meet(claim), sess(claim)].filter((p) => p !== DASH);
  return parts.length ? parts.join(' · ').toUpperCase() : 'FORMULA 1';
};

const footer = (claim: Claim): string =>
  `${claim.sourceDomain.toUpperCase()} · ${dateId(claim.observedAt)}`;

/** L2. Seven archetypes, four layouts each, selected by claimType not by taste. */
export const archetypes: Archetype[] = [
  {
    key: 'session_result',
    claimTypes: ['session_result'],
    layouts: ['hero-left', 'full-bleed', 'big-number', 'portrait'],
    model(claim: Claim): ArtModel {
      const p = n(claim.values.position);
      const driver = s(claim.entities.driver);
      const team = s(claim.entities.team);
      return {
        eyebrow: meetingLine(claim),
        // A mega-sized dash is a bug, not a fallback: drop the block instead.
        bigNumber: p ? `P${p}` : undefined,
        bigLabel: p ? sess(claim) : undefined,
        headline: driver === DASH ? 'Hasil sesi' : driver,
        subhead: [team !== DASH ? team : null, lapTime(n(claim.values.duration)) !== DASH ? lapTime(n(claim.values.duration)) : null]
          .filter(Boolean).join('  ·  ') || undefined,
        footnote: footer(claim),
        entity: resolveEntity(team !== DASH ? team : (claim.entities.teamColour ?? null)),
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
  {
    key: 'classification',
    claimTypes: ['classification'],
    layouts: ['stacked', 'framed', 'split', 'hero-right'],
    model(claim: Claim): ArtModel {
      const rows = rowsOf(claim);
      const leader = rows[0];
      return {
        eyebrow: meetingLine(claim),
        // claim.headline is the raw OpenF1 title ("Practice 2 - Madrid 2026")
        // for every structured claim here; it is never the display headline.
        headline: `Klasemen ${sess(claim)}`,
        rows: toTableRows(rows, rows.length > 12 ? 14 : 10, 'time'),
        subhead: leader ? `Tercepat: ${s(leader.driver)} ${lapTime(leader.duration ?? null)}` : undefined,
        footnote: footer(claim),
        entity: resolveEntity(leader?.team ?? null),
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
  {
    key: 'standings',
    claimTypes: ['standings', 'constructor_standings'],
    layouts: ['stacked', 'framed', 'big-number', 'split'],
    model(claim: Claim): ArtModel {
      const rows = rowsOf(claim);
      const leader = rows[0];
      return {
        eyebrow: `KLASEMEN ${s(claim.values.season)} · RONDE ${num(n(claim.values.round))}`,
        headline: claim.headline ?? 'Klasemen Pembalap',
        rows: toTableRows(rows, 10, 'points'),
        bigNumber: leader?.points != null ? String(leader.points) : undefined,
        bigLabel: leader ? `POIN · ${s(leader.driver)}` : undefined,
        footnote: footer(claim),
        entity: resolveEntity(leader?.team ?? null),
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
  {
    key: 'penalty',
    claimTypes: ['penalty', 'stewards_decision'],
    layouts: ['framed', 'big-number', 'hero-left', 'stacked'],
    model(claim: Claim): ArtModel {
      const penalty = s(claim.values.penalty);
      return {
        eyebrow: `KEPUTUSAN STEWARD · ${meetingLine(claim)}`,
        bigNumber: penalty !== DASH ? penalty : undefined,
        bigLabel: penalty !== DASH ? 'PENALTI' : undefined,
        headline: s(claim.entities.driver),
        subhead: s(claim.values.reason) !== DASH ? s(claim.values.reason) : undefined,
        footnote: footer(claim),
        // Race Red, fixed: "red flags, penalties, DNFs, breaking paddock
        // alerts" is a semantic colour in this brand, not a team colour —
        // a steward's decision reads as an alert regardless of who it's about.
        entity: RACE_RED,
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
  {
    key: 'driver_line',
    claimTypes: ['driver_line', 'roster_move', 'contract'],
    layouts: ['portrait', 'hero-left', 'hero-right', 'framed'],
    model(claim: Claim): ArtModel {
      const team = s(claim.entities.team);
      return {
        eyebrow: s(claim.values.season) !== DASH ? `MUSIM ${s(claim.values.season)}` : 'FORMULA 1',
        headline: s(claim.entities.driver),
        subhead: team !== DASH ? team : undefined,
        bigLabel: s(claim.values.contractYears) !== DASH ? `${s(claim.values.contractYears)} TAHUN` : undefined,
        footnote: footer(claim),
        entity: resolveEntity(team),
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
  {
    key: 'schedule',
    claimTypes: ['schedule', 'session_schedule'],
    layouts: ['stacked', 'framed', 'split', 'big-number'],
    model(claim: Claim): ArtModel {
      const sessions = Array.isArray(claim.values.sessions)
        ? (claim.values.sessions as { name?: string; startsAt?: string; day?: string }[]) : [];
      return {
        eyebrow: `JADWAL · ${meet(claim)}`.toUpperCase(),
        // Same as classification: claim.headline here is the raw OpenF1
        // title ("Jadwal Spain"), never the localized display headline.
        headline: meet(claim),
        rows: sessions.slice(0, 8).map((x, i) => ({
          rank: String(i + 1),
          primary: s(x.name),
          secondary: s(x.day),
          value: x.startsAt && Number.isFinite(Date.parse(x.startsAt)) ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(x.startsAt)).replace('.', ':') : DASH,
          trailing: 'WIB',
        })),
        footnote: footer(claim),
        entity: null,
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
  {
    key: 'quote',
    claimTypes: ['quote', 'press_conference', 'article', 'document'],
    layouts: ['portrait', 'framed', 'hero-left', 'full-bleed'],
    model(claim: Claim): ArtModel {
      return {
        eyebrow: meetingLine(claim),
        quote: claim.values.quote || claim.supportingQuote ? `“${s(claim.values.quote ?? claim.supportingQuote)}”` : undefined,
        headline: claim.claimType === 'article' || claim.claimType === 'document' ? claim.headline ?? s(claim.entities.title) : s(claim.entities.speaker ?? claim.entities.driver),
        attribution: s(claim.entities.team),
        footnote: footer(claim),
        entity: resolveEntity(claim.entities.team ?? null),
        imageUrl: claim.imageUrl ?? null,
      };
    },
  },
];
