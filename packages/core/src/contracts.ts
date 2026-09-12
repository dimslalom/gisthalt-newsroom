/**
 * The contracts. Everything else in the repo is written against this file.
 * Nothing here imports anything: it must stay dependency-free and pure.
 */

export type Vertical = 'f1' | 'vct' | 'film';
export type Tier = 'A' | 'B' | 'C';
export type Platform = 'x' | 'instagram' | 'threads' | 'tiktok';

/** A raw thing we fetched from a source. Never mutated after insert. */
export interface RawItem {
  sourceKey: string;
  externalId: string;
  vertical: Vertical;
  tier: Tier;
  sourceDomain: string;
  rawUrl: string | null;
  title: string;
  /** Prose body when the source has one. Structured sources leave this empty. */
  body: string;
  /** Whatever the source returned, unmodified. */
  payload: Record<string, unknown>;
  observedAt: Date;
  imageUrl?: string | null;
}

export interface PollContext {
  now: Date;
  /** Cursor the adapter itself defined on its previous run. */
  cursor: Record<string, unknown> | null;
  fetch: typeof globalThis.fetch;
  log: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface SourceAdapter {
  key: string;
  vertical: Vertical;
  tier: Tier;
  /** Cadence in seconds. May differ inside a live window. */
  cadence(now: Date): number;
  /** Fetch and return raw items. Must be idempotent and side-effect free. */
  poll(ctx: PollContext): Promise<RawItem[]>;
}

/** A structured, typed assertion extracted from an item. */
export interface Claim {
  vertical: Vertical;
  claimType: string;
  entities: Record<string, string>;
  values: Record<string, unknown>;
  /** REQUIRED for every prose-extracted numeric value. Empty for tier A. */
  supportingQuote: string | null;
  sourceTier: Tier;
  sourceDomain: string;
  observedAt: Date;
  /** Free-form flags the extractor attached: 'rumour', 'exclusive', ... */
  tags?: string[];
  /** Human-readable headline candidate. Copy, not fact. */
  headline?: string;
  imageUrl?: string | null;
}

export type GateOutcome =
  | { outcome: 'auto'; rule: 'R1' | 'R2' | 'R3'; reason: string; corroboratingItemIds?: string[] }
  | { outcome: 'review'; rule: 'R4'; reason: string }
  | { outcome: 'drop'; rule: 'R0'; reason: string };

export interface GateContext {
  now: Date;
  /** Tier B domains allowed to auto-publish with a quote (R2). */
  tierBAllowlist: string[];
  /** Terms that force R0. Comes from brands/<x>/blocklist.ts, never from code. */
  blocklist: string[];
  /** Terms that force R4 even when otherwise clean. */
  hedgeTerms: string[];
  /** Required fields per claimType for R1. */
  requiredFields: Record<string, string[]>;
  /** Other items already asserting this dedupeHash: { domain, observedAt, itemId }. */
  corroboration: { itemId: string; domain: string; observedAt: Date }[];
  /** R3 window. */
  corroborationWindowMinutes: number;
  /** Feature flags: R2/R3 stay off until the quote requirement has proven itself. */
  enableR2: boolean;
  enableR3: boolean;
}

export interface PublishRequest {
  accountId: string;
  platform: Platform;
  caption: string;
  imagePaths: string[];
  /** compositionId + platform. Never double-post. */
  idempotencyKey: string;
}

export interface PublishResult {
  uncertain?: boolean;
  ok: boolean;
  platformPostId?: string;
  url?: string;
  error?: string;
  latencyMs: number;
}

export interface SessionHealth {
  accountId: string;
  healthy: boolean;
  checkedAt: Date;
  screenshotPath?: string | null;
  detail?: string;
}

export interface PublishAdapter {
  platform: Platform;
  publish(req: PublishRequest): Promise<PublishResult>;
  checkSession(accountId: string): Promise<SessionHealth>;
}
