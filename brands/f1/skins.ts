import type { EntityColour, Skin } from '@newsroom/design';

/**
 * SektorTiga's visual identity is one deep-black canvas with two semantic
 * accents — not a rotating set of moods. The placeholder brand had five
 * skins (dark/light/team/tournament/archival) to explore variety before a
 * real identity existed; none of "light", "tournament" or "archival" appear
 * anywhere in the brand guide, so they're gone for this brand. Variety here
 * comes from layout and accent rotation instead, which is exactly what a
 * mature single-look brand should do.
 *
 * Team colours still inject per post (usesEntityColour: true) — the brand
 * guide never asked for monochrome-only in the data itself, only in the
 * canvas — but when there's no team to key off (a quote, a schedule card,
 * standings with no single leader), the accent falls back to Sector Purple,
 * the guide's own "primary brand accent".
 */
export const sektorTigaSkins: Skin[] = [
  {
    key: 'dark',
    bg: '#0A0B0D',      // Pitch Black — canvas
    panel: '#14161A',   // Deep Charcoal — card surface, telemetry panels
    fg: '#FFFFFF',       // Signal White — headlines, lap times, primary data
    muted: '#94A3B8',    // Cool Muted Slate — subtitles, driver names, doc refs
    line: '#22252B',
    usesEntityColour: true,
    imagery: 'photo',
    fallbackAccent: '#A855F7', // Sector Purple — primary brand accent
  },
];

/** Race Red: "red flags, penalties, DNFs, breaking paddock alerts" — a fixed
 *  semantic colour, not a rotating mood. Applied directly by the archetypes
 *  that mean it (penalty, DNF/DSQ results), never picked at random.
 *  5.23:1 on Pitch Black — verified, not asserted. */
export const RACE_RED: EntityColour = { key: 'race-red', name: 'Peringatan', hex: '#EF4444', onColour: '#0A0B0D' };
