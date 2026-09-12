import type { Tokens } from '@newsroom/design';

/**
 * L1. Placeholder set, ported from the verified spike. Never varies inside the
 * brand; the real identity replaces the values here in phase 6 and nothing
 * downstream changes.
 */
export const tokens: Tokens = {
  fs: { mega: 232, hero: 118, h1: 68, h2: 44, body: 30, lab: 21, fine: 18 },
  ls: { lab: '.22em', disp: '-.01em' },
  pad: 64,
  stroke: 3,
  unit: 8,
  radius: 0,
  fonts: {
    display: "'Saira Condensed', 'NotoSansJP', 'NotoSansKR', sans-serif",
    body: "'IBM Plex Sans', 'NotoSansJP', 'NotoSansKR', sans-serif",
    mono: "'IBM Plex Mono', 'NotoSansJP', 'NotoSansKR', monospace",
  },
  safeMargin: 48,
  logo: { text: 'Lintasan', mark: '//' },
};
