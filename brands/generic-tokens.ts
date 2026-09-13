import type { Tokens } from '@newsroom/design';

/**
 * L1 placeholder set for any brand that hasn't designed its own real identity
 * yet (VCT, Film/TV as of this writing). Deliberately independent of any one
 * vertical's file: giving F1 a real brand identity must never silently change
 * how VCT or Film renders. Ported from the verified spike; replace per-brand
 * when that vertical gets its own real design pass.
 */
export const genericTokens: Tokens = {
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
  logo: { text: 'Newsroom', mark: '//' },
};
