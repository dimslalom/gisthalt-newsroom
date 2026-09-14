import type { Platform, Tier, Vertical } from '@newsroom/core';

export interface ItemRow {
  id: string; sourceKey: string; externalId: string; fetchedAt: Date; observedAt: Date;
  payload: Record<string, unknown>; contentHash: string; preKey: string;
  vertical: Vertical; tier: Tier; sourceDomain: string; rawUrl: string | null;
  title: string; body: string; imageUrl: string | null;
}

export interface ClaimRow {
  id: string; itemId: string; vertical: Vertical; claimType: string;
  entities: Record<string, string>; values: Record<string, unknown>;
  supportingQuote: string | null; headline: string | null; imageUrl: string | null;
  tags: string[]; sourceTier: Tier; sourceDomain: string; extractedBy: string;
  dedupeHash: string; observedAt: Date; createdAt: Date;
}

export interface DecisionRow {
  id: string; claimId: string; rule: string; outcome: 'auto' | 'review' | 'drop';
  reason: string; corroboratingItemIds: string[]; decidedAt: Date;
}

export interface CompositionRow {
  id: string; claimId: string; accountId: string; archetype: string; layout: string;
  skin: string; accents: string[]; captionByPlatform: Record<string, string>;
  imagePaths: string[]; seed: number; renderedAt: Date | null; createdAt: Date;
  /** A per-post design edited in the studio; absent or null = the layout's document. */
  doc?: unknown;
}

export type PostStatus = 'ready' | 'publishing' | 'published' | 'failed' | 'held' | 'simulated' | 'uncertain' | 'cancelled' | 'retraction_requested' | 'retracted';

export interface PostRow {
  id: string; compositionId: string; accountId: string; platform: Platform;
  status: PostStatus; idempotencyKey: string; platformPostId: string | null;
  scheduledFor: Date | null; publishedAt: Date | null; latencyMs: number | null;
  error: string | null; archivePath: string | null;
}

export interface AccountRow {
  id: string; brand: string; handle: string; platform: Platform; profileDir: string;
  warmupStage: number; dailyCap: number; active: boolean;
}

export interface SessionRow {
  id: string; accountId: string; lastOkAt: Date | null; lastCheckAt: Date | null;
  healthy: boolean; lastScreenshotPath: string | null;
}

export interface ModelUsageRow {
  id: string; model: string; day: string; minute: string; requestCount: number; tokenCount: number;
}

export interface SourceRow {
  id: string; key: string; vertical: Vertical; tier: Tier; cadenceSeconds: number;
  lastSuccessAt: Date | null; lastErrorAt: Date | null; lastError: string | null;
  itemsSeen: number; cursor: Record<string, unknown> | null; active: boolean;
}

export type ReviewState = 'pending' | 'approved' | 'rejected' | 'expired' | 'held';

export interface ReviewRow {
  id: string; claimId: string; compositionId: string | null; state: ReviewState;
  reason: string; rule: string; createdAt: Date; expiresAt: Date;
  resolvedAt: Date | null; note: string | null;
}

export interface EventRow {
  id: string; at: Date; stage: string; level: 'info' | 'warn' | 'error';
  msg: string; dedupeHash: string | null; meta: Record<string, unknown>; latencyMs: number | null;
}

export interface LlmCacheRow { id: string; cacheKey: string; model: string; response: unknown; createdAt: Date }
