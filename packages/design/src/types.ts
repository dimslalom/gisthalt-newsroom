import type { Claim, Vertical } from '@newsroom/core';

/** L1. Never varies within a brand. */
export interface Tokens {
  fs: { mega: number; hero: number; h1: number; h2: number; body: number; lab: number; fine: number };
  ls: { lab: string; disp: string };
  pad: number; stroke: number; unit: number; radius: number;
  fonts: { display: string; body: string; mono: string };
  safeMargin: number;
  logo: {
    text: string;
    mark: string;
    /** Raw inline SVG markup for the real brand mark, baked into the token file
     *  so no runtime asset fetch is ever needed. Rendered in place of the text
     *  mark when set; `text`/`mark` still back the ticker and other text-only
     *  contexts. */
    svgMarkup?: string;
  };
}

export type SkinKey = 'dark' | 'light' | 'team' | 'tournament' | 'archival';
export type AccentKey = 'diagonal' | 'halftone' | 'grain' | 'ticker' | 'watermark' | 'cropmarks';

export interface Skin {
  key: SkinKey;
  bg: string; panel: string; fg: string; muted: string; line: string;
  /** When true the entity colour is injected as --accent. */
  usesEntityColour: boolean;
  /** Preferred image treatment: skins without imagery read as typography-only. */
  imagery: 'photo' | 'none' | 'duotone';
  /** --accent when there's no entity colour to inject (usesEntityColour: false,
   *  or no entity on this claim). Each skin owns its own — a brand's primary
   *  accent colour, not a hardcoded generic grey. */
  fallbackAccent?: string;
}

export interface EntityColour {
  key: string;
  name: string;
  hex: string;
  /** Contrast-checked pairing stored alongside the hex, so light-on-cyan never happens. */
  onColour: string;
}

/** L2. Selected by claimType, not by taste. */
export interface Archetype {
  key: string;
  claimTypes: string[];
  /** Exactly four. A layout not listed here can never be selected for this archetype. */
  layouts: LayoutKey[];
  /** Turn a claim into the fields the template draws. No IO, no model. */
  model(claim: Claim): ArtModel;
}

/** The eight shipped layouts. A brand may add its own slots at runtime (see
 *  layout-slots.ts) — these stay the seed sources, the CSS-template fallback,
 *  and the built-in derive-siblings targets, never the whole selectable set. */
export const BUILTIN_LAYOUTS = [
  'hero-left', 'hero-right', 'full-bleed', 'framed', 'split', 'stacked', 'big-number', 'portrait',
] as const;
export type BuiltinLayoutKey = (typeof BUILTIN_LAYOUTS)[number];
/** A layout slot key — one of the eight built-ins, or a brand-added custom
 *  slot. Kept as a plain string, not a closed union, because the set is
 *  editable at runtime. */
export type LayoutKey = string;

export interface TableRow {
  rank: string;
  primary: string;
  secondary?: string;
  value: string;
  trailing?: string;
  colour?: string;
  onColour?: string;
}

/** The only thing a layout knows how to draw. */
export interface ArtModel {
  eyebrow: string;
  headline: string;
  subhead?: string;
  bigNumber?: string;
  bigLabel?: string;
  rows?: TableRow[];
  footnote: string;
  entity?: EntityColour | null;
  imageUrl?: string | null;
  quote?: string;
  attribution?: string;
}

export interface Brand {
  key: string;
  vertical: Vertical;
  name: string;
  tokens: Tokens;
  skins: Skin[];
  archetypes: Archetype[];
  entities: Record<string, EntityColour>;
  blocklist: string[];
  hedgeTerms: string[];
  tierBAllowlist: string[];
  requiredFields: Record<string, string[]>;
  /** Indonesian copy templates, used when no model call is made. */
  copy: Record<string, (m: ArtModel, claim: Claim) => string>;
  /** Persona, tone and lexicon rules appended to the Gemini caption prompt.
   *  Tier A claims never reach the model at all, so this only governs the
   *  minority of posts that need real phrasing, not the majority template path. */
  voiceGuide?: string;
}

export interface CompositionSpec {
  brand: Brand;
  archetype: Archetype;
  layout: LayoutKey;
  skin: Skin;
  accents: AccentKey[];
  model: ArtModel;
  /** Resolved by the guards before the HTML is built. */
  logoPlacement?: 'tl' | 'tr' | 'bl' | 'br' | 'strip';
  textTreatment?: { scrim: number; colour: string; overImage: boolean };
  /** Which of the document's own palette variants to resolve raw colour
   *  references against. Only meaningful for a doc-backed layout that
   *  declares a palette; ignored otherwise. Defaults to the first variant. */
  paletteVariant?: string;
}
