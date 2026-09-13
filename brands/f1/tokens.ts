import type { Tokens } from '@newsroom/design';
import { s3LogoSvg } from './logo.ts';

/**
 * L1. SektorTiga's real identity (@sektortigaf1) — see
 * "SektorTiga — Brand Design & Operational Guidelines". Type scale, spacing
 * and stroke weight are unchanged from the verified placeholder spike (that
 * geometry passed the full 924-image golden matrix; the brand guide gives no
 * numeric sizing to replace it with). What changed: typography, the logo
 * lockup, and — in skins.ts — the palette and accent semantics.
 */
export const tokens: Tokens = {
  fs: { mega: 232, hero: 118, h1: 68, h2: 44, body: 30, lab: 21, fine: 18 },
  ls: { lab: '.22em', disp: '-.01em' },
  pad: 64,
  stroke: 3,
  unit: 8,
  radius: 0,
  fonts: {
    // "Geometric, technical sans-serif... always use tabular figures for
    // timing sheets and deltas" covers both headlines and numerics in one
    // typeface — so `mono` is Plus Jakarta Sans too, not a monospace; Inter
    // and Plus Jakarta Sans both carry full tabular-figure support, which is
    // what the brand doc actually asks for, not a typewriter aesthetic.
    display: "'Plus Jakarta Sans', 'NotoSansJP', 'NotoSansKR', sans-serif",
    body: "'Inter', 'NotoSansJP', 'NotoSansKR', sans-serif",
    mono: "'Plus Jakarta Sans', 'NotoSansJP', 'NotoSansKR', sans-serif",
  },
  safeMargin: 48,
  logo: { text: 'Sektor Tiga', mark: 'S3', svgMarkup: s3LogoSvg },
};
