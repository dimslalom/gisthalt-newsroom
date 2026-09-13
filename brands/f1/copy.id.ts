import { DASH, gap, lapTime } from '@newsroom/core';
import type { Claim } from '@newsroom/core';
import type { ArtModel } from '@newsroom/design';
import { meetingId, sessionId } from './locale.id.ts';

/**
 * Template-only Indonesian copy. Tier A claims never reach the model at all —
 * this is most of the volume on a race weekend, so getting SektorTiga's voice
 * right here matters as much as the Gemini prompt in voice.ts does. "aku"
 * closes with a reflection, "kamu" closes with a question — matching the
 * brand guide's own sample captions, never both, never neither.
 */
export const copy: Record<string, (m: ArtModel, claim: Claim) => string> = {
  session_result: (m, c) =>
    [`${m.headline} ${m.bigNumber ?? ''} di ${sessionId(c.entities.session) || 'sesi'} ${meetingId(c.entities.meeting)}`.trim(),
     m.subhead ? m.subhead : '',
     '⏱️ Waktu lengkap dan selisih tiap pembalap ada di grafik ini.',
     tags(c)].filter(Boolean).join('\n\n'),

  classification: (m, c) => {
    const top = (m.rows ?? []).slice(0, 3)
      .map((r) => `${r.rank}. ${r.primary} ${r.value}${r.trailing && r.trailing !== DASH ? ` (${r.trailing})` : ''}`);
    return [
      `${m.headline} di ${meetingId(c.entities.meeting)}`.trim(),
      top.join('\n'),
      'Rangkuman lengkap sudah aku susun di atas.',
      tags(c),
    ].filter(Boolean).join('\n\n');
  },

  standings: (m, c) => {
    const top = (m.rows ?? []).slice(0, 3).map((r) => `${r.rank}. ${r.primary}: ${r.value} poin`);
    return [
      m.headline,
      top.join('\n'),
      'Menurut kamu, siapa yang paling berpeluang sampai akhir musim?',
      tags(c),
    ].filter(Boolean).join('\n\n');
  },

  penalty: (m, c) =>
    [
      `📑 ${m.headline} kena ${m.bigNumber ?? 'penalti'}`,
      m.subhead ?? '',
      'Detail lengkap ada di dokumen resmi FIA.',
      tags(c),
    ].filter(Boolean).join('\n\n'),

  driver_line: (m, c) =>
    [
      rumourPrefix(c),
      (m.subhead ? `${m.headline}: ${m.subhead}` : m.headline).trim(),
      'Menurut kamu, seberapa besar dampaknya untuk skuad musim depan?',
      tags(c),
    ].filter(Boolean).join('\n\n'),

  schedule: (m, c) =>
    [
      `Jadwal ${m.headline}`,
      (m.rows ?? []).map((r) => `${r.primary}: ${r.value} ${r.trailing}`).join('\n'),
      'Jangan sampai ketinggalan sesi favoritmu.',
      tags(c),
    ].filter(Boolean).join('\n\n'),

  quote: (m, c) =>
    [
      rumourPrefix(c),
      m.quote ?? '',
      `${m.quote ? '- ' : ''}${m.headline}${m.attribution && m.attribution !== DASH ? `, ${m.attribution}` : ''}`,
      tags(c),
    ].filter(Boolean).join('\n\n'),
};

/**
 * "Laporan dari media Eropa menyebutkan..." — the guide's own required
 * qualifier for anything not yet officially confirmed. Applied from the tags
 * the extractor already attached; never inferred from the prose itself.
 */
function rumourPrefix(c: Claim): string {
  const tags = c.tags ?? [];
  const unconfirmed = tags.some((t) => ['rumour', 'report', 'exclusive'].includes(t)) && !tags.includes('confirmed') && !tags.includes('official');
  return unconfirmed ? 'Laporan dari media Eropa menyebutkan:' : '';
}

function tags(c: Claim): string {
  const base = ['#F1', '#Formula1', '#SektorTiga'];
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
