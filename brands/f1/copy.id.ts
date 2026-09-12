import { DASH, gap, lapTime } from '@newsroom/core';
import type { Claim } from '@newsroom/core';
import type { ArtModel } from '@newsroom/design';
import { meetingId, sessionId } from './locale.id.ts';

/**
 * Template-only Indonesian copy. Structured tier A posts call no model at all,
 * which is most of the volume on a race weekend. The LLM only rewrites this
 * when it can do better, and never invents a fact that is not already here.
 * No URLs, ever: an X post with a link costs 13x on the future API path.
 */
export const copy: Record<string, (m: ArtModel, claim: Claim) => string> = {
  session_result: (m, c) =>
    [`${m.headline} ${m.bigNumber ?? ""} di ${sessionId(c.entities.session) || 'sesi'} ${meetingId(c.entities.meeting)}`.trim(),
     m.subhead ? m.subhead : '',
     tags(c)].filter(Boolean).join('\n\n'),

  classification: (m, c) => {
    const top = (m.rows ?? []).slice(0, 3)
      .map((r) => `${r.rank}. ${r.primary} ${r.value}${r.trailing && r.trailing !== DASH ? ` (${r.trailing})` : ''}`);
    return [`${m.headline} — ${meetingId(c.entities.meeting)}`.trim(), top.join('\n'), tags(c)].filter(Boolean).join('\n\n');
  },

  standings: (m, c) => {
    const top = (m.rows ?? []).slice(0, 3).map((r) => `${r.rank}. ${r.primary} — ${r.value} poin`);
    return [m.headline, top.join('\n'), tags(c)].filter(Boolean).join('\n\n');
  },

  penalty: (m, c) =>
    [`${m.headline} kena ${m.bigNumber ?? 'penalti'}`, m.subhead ?? '', tags(c)].filter(Boolean).join('\n\n'),

  driver_line: (m, c) =>
    [`${m.headline} — ${m.subhead ?? ''}`.trim(), tags(c)].filter(Boolean).join('\n\n'),

  schedule: (m, c) =>
    [`Jadwal ${m.headline}`, (m.rows ?? []).map((r) => `${r.primary} — ${r.value} ${r.trailing}`).join('\n'), tags(c)]
      .filter(Boolean).join('\n\n'),

  quote: (m, c) => [m.quote ?? '', `${m.quote ? '— ' : ''}${m.headline}${m.attribution && m.attribution !== DASH ? `, ${m.attribution}` : ''}`, tags(c)]
    .filter(Boolean).join('\n\n'),
};

function tags(c: Claim): string {
  const base = ['#F1', '#Formula1'];
  const meeting = meetingId(c.entities.meeting).replace(/[^A-Za-z0-9]/g, '');
  if (meeting) base.push(`#${meeting}`);
  return base.join(' ');
}

/** Per-platform limits, enforced before a caption ever reaches a publisher. */
export const PLATFORM_LIMITS: Record<string, number> = {
  x: 280, instagram: 2200, threads: 500, tiktok: 2200,
};

export function fitCaption(caption: string, platform: string): string {
  const limit = PLATFORM_LIMITS[platform] ?? 2200;
  if (caption.length <= limit) return caption;
  const cut = caption.slice(0, limit - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > limit * 0.6 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

export { lapTime, gap };
