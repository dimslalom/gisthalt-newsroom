import type { Claim, Vertical } from '@newsroom/core';
import { DASH, dateId, safeHeadline, text } from '@newsroom/core';
import { SKINS, type Brand, type LayoutKey, type ArtModel } from '@newsroom/design';
import { genericTokens as tokens } from './generic-tokens.ts';
import { blocklist, hedgeTerms } from './f1/blocklist.ts';
const layouts: LayoutKey[][] = [ ['hero-left','hero-right','framed','big-number'], ['stacked','framed','split','hero-right'], ['portrait','hero-left','framed','stacked'], ['framed','big-number','hero-left','stacked'], ['stacked','framed','split','big-number'], ['stacked','framed','split','big-number'], ['portrait','framed','hero-left','full-bleed'] ];
export interface VerticalConfig { key: Vertical; name: string; mark: string; archetypes: { key: string; types: string[]; label: string; required: string[] }[]; allowlist: string[] }
export function makeBrand(config: VerticalConfig): Brand {
  const archetypes = config.archetypes.map((a, i) => ({
    key: a.key, claimTypes: a.types, layouts: layouts[i]!,
    model(c: Claim): ArtModel {
      const rows = Array.isArray(c.values.rows) ? c.values.rows as Record<string, unknown>[] : [];
      // entities.title is a real field for a structured release/cast/trailer
      // claim, but for an 'unextracted' claim it's the exact same raw source
      // title as headline (extract.ts sets both to item.title) — trusting it
      // there just swaps which untranslated string leaks onto the graphic.
      const titleFallback = c.tags?.includes('unextracted') ? undefined : c.entities.title;
      const headline = safeHeadline(c, titleFallback ?? ([c.entities.team1, c.entities.team2].filter(Boolean).join(' vs ') || a.label));
      const revenue = typeof c.values.revenue === 'number' ? `${c.values.currency ?? ''} ${new Intl.NumberFormat('id-ID').format(c.values.revenue)}`.trim() : undefined;
      const score = typeof c.values.score1 === 'number' && typeof c.values.score2 === 'number' ? `${c.values.score1}-${c.values.score2}` : undefined;
      return {
        eyebrow: `${a.label} · ${c.entities.tournament ?? config.name}`.toUpperCase(), headline,
        bigNumber: score ?? revenue,
        subhead: [c.entities.player, c.entities.team, c.values.season, c.entities.studio, typeof c.values.releaseDate === 'string' ? c.values.releaseDate : null, typeof c.values.status === 'string' ? c.values.status : null].filter(Boolean).join(' · ') || undefined,
        rows: rows.slice(0,14).map((r,i) => ({ rank: text(String(r.position ?? i+1)), primary: text(String(r.name ?? r.player ?? r.driver ?? r.team ?? r.title ?? DASH)), secondary: r.secondary ? String(r.secondary) : undefined, value: text(String(r.score ?? r.points ?? r.value ?? DASH)), trailing: r.trailing ? String(r.trailing) : undefined })),
        quote: ['quote','review'].includes(c.claimType) ? c.supportingQuote ?? String(c.values.quote ?? '') : undefined,
        attribution: c.entities.speaker,
        footnote: `${c.sourceDomain.toUpperCase()} · ${dateId(c.observedAt)}`, imageUrl: c.imageUrl,
      };
    },
  }));
  const copy = Object.fromEntries(archetypes.map((a) => [a.key, (m: ArtModel) => [m.headline, m.bigNumber, m.subhead, ...(m.rows ?? []).slice(0,3).map((r) => `${r.rank}. ${r.primary}: ${r.value}`), `#${config.name.replace(/\s/g,'')}`].filter(Boolean).join('\n\n')]));
  // Every post is a full photo background, so a skin that drops the photo
  // (imagery: 'none') would render a blank card.
  return { key: config.key, vertical: config.key, name: config.name, tokens: { ...tokens, logo: { text: config.name.toUpperCase(), mark: config.mark } }, skins: SKINS.filter((s) => s.imagery !== 'none'),
    archetypes, entities: {}, blocklist, hedgeTerms, tierBAllowlist: config.allowlist,
    requiredFields: Object.fromEntries(config.archetypes.flatMap((a) => a.types.filter((t) => t !== 'article').map((type) => [type, a.required]))), copy };
}
