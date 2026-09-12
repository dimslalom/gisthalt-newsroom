import type { Claim, Vertical } from '@newsroom/core';

/** L1. Never varies within a brand. */
export interface Tokens {
  fs: { mega: number; hero: number; h1: number; h2: number; body: number; lab: number; fine: number };
  ls: { lab: string; disp: string };
  pad: number; stroke: number; unit: number; radius: number;
  fonts: { display: string; body: string; mono: string };
  safeMargin: number;
  logo: { text: string; mark: string };
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

export type LayoutKey =
  | 'hero-left' | 'hero-right' | 'full-bleed' | 'framed'
  | 'split' | 'stacked' | 'big-number' | 'portrait';

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
}
