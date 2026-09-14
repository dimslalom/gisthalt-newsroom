import { bigint, boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/** A raw thing we fetched from a source. Never mutated after insert. */
export const items = pgTable('items', {
  id: text('id').primaryKey(),
  sourceKey: text('source_key').notNull(),
  externalId: text('external_id').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').notNull(),
  contentHash: text('content_hash').notNull(),
  preKey: text('pre_key').notNull(),
  vertical: text('vertical').notNull(),
  tier: text('tier').notNull(),
  sourceDomain: text('source_domain').notNull(),
  rawUrl: text('raw_url'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  imageUrl: text('image_url'),
}, (t) => ({
  contentHashIdx: index('items_content_hash_idx').on(t.contentHash),
  preKeyIdx: index('items_pre_key_idx').on(t.preKey),
}));

/** A structured, typed assertion extracted from an item. */
export const claims = pgTable('claims', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  vertical: text('vertical').notNull(),
  claimType: text('claim_type').notNull(),
  entities: jsonb('entities').notNull(),
  values: jsonb('values').notNull(),
  supportingQuote: text('supporting_quote'),
  headline: text('headline'),
  imageUrl: text('image_url'),
  tags: jsonb('tags'),
  sourceTier: text('source_tier').notNull(),
  sourceDomain: text('source_domain').notNull(),
  extractedBy: text('extracted_by').notNull(),
  dedupeHash: text('dedupe_hash').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (t) => ({
  dedupeIdx: uniqueIndex('claims_dedupe_hash_idx').on(t.dedupeHash),
}));

/** What the gate decided and why. Append-only audit trail. */
export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  claimId: text('claim_id').notNull(),
  rule: text('rule').notNull(),
  outcome: text('outcome').notNull(), // auto | review | drop
  reason: text('reason').notNull(),
  corroboratingItemIds: jsonb('corroborating_item_ids'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
}, (t) => ({ claimIdx: index('decisions_claim_idx').on(t.claimId) }));

/** A chosen visual + copy treatment for a claim. */
export const compositions = pgTable('compositions', {
  id: text('id').primaryKey(),
  claimId: text('claim_id').notNull(),
  accountId: text('account_id').notNull(),
  archetype: text('archetype').notNull(),
  layout: text('layout').notNull(),
  skin: text('skin').notNull(),
  accents: jsonb('accents').notNull(),
  captionByPlatform: jsonb('caption_by_platform').notNull(),
  imagePaths: jsonb('image_paths').notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  renderedAt: timestamp('rendered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  /** A hand-edited design for this one post. Null means "the layout's own document". */
  doc: jsonb('doc'),
}, (t) => ({ accountIdx: index('compositions_account_idx').on(t.accountId, t.createdAt) }));

/** One published (or failed) post per platform. */
export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  compositionId: text('composition_id').notNull(),
  accountId: text('account_id').notNull(),
  platform: text('platform').notNull(),
  status: text('status').notNull(), // ready | publishing | published | failed | held
  idempotencyKey: text('idempotency_key').notNull(),
  platformPostId: text('platform_post_id'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  archivePath: text('archive_path'),
}, (t) => ({
  idemIdx: uniqueIndex('posts_idempotency_idx').on(t.idempotencyKey),
  capIdx: index('posts_account_published_idx').on(t.accountId, t.publishedAt),
}));

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  brand: text('brand').notNull(),
  handle: text('handle').notNull(),
  platform: text('platform').notNull(),
  profileDir: text('profile_dir').notNull(),
  warmupStage: integer('warmup_stage').notNull().default(0),
  dailyCap: integer('daily_cap').notNull().default(3),
  active: boolean('active').notNull().default(true),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  lastOkAt: timestamp('last_ok_at', { withTimezone: true }),
  lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
  healthy: boolean('healthy').notNull().default(false),
  lastScreenshotPath: text('last_screenshot_path'),
});

/** Token-bucket persistence, so a restart does not reset the daily count. */
export const modelUsage = pgTable('model_usage', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  day: text('day').notNull(),
  minute: text('minute').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  tokenCount: integer('token_count').notNull().default(0),
});

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  vertical: text('vertical').notNull(),
  tier: text('tier').notNull(),
  cadenceSeconds: integer('cadence_seconds').notNull(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  lastError: text('last_error'),
  itemsSeen: integer('items_seen').notNull().default(0),
  cursor: jsonb('cursor'),
  active: boolean('active').notNull().default(true),
});

/** The review queue. Items expire after 90 minutes and auto-reject. */
export const reviewItems = pgTable('review_items', {
  id: text('id').primaryKey(),
  claimId: text('claim_id').notNull(),
  compositionId: text('composition_id'),
  state: text('state').notNull(), // pending | approved | rejected | expired | held
  reason: text('reason').notNull(),
  rule: text('rule').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  note: text('note'),
});

/** Cached LLM responses keyed by claim hash + purpose. A retry costs nothing. */
export const llmCache = pgTable('llm_cache', {
  id: text('id').primaryKey(),
  cacheKey: text('cache_key').notNull(),
  model: text('model').notNull(),
  response: jsonb('response').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (t) => ({ keyIdx: uniqueIndex('llm_cache_key_idx').on(t.cacheKey) }));

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  stage: text('stage').notNull(),
  level: text('level').notNull(),
  msg: text('msg').notNull(),
  dedupeHash: text('dedupe_hash'),
  meta: jsonb('meta'),
  latencyMs: real('latency_ms'),
});

// Independent observations survive canonical claim deduplication.
export const evidence = pgTable('claim_evidence', {
  id: text('id').primaryKey(), dedupeHash: text('dedupe_hash').notNull(),
  itemId: text('item_id').notNull(), domain: text('domain').notNull(), tier: text('tier').notNull(), admissible: boolean('admissible').notNull().default(true),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
}, (t) => ({ observation: uniqueIndex('evidence_observation_idx').on(t.dedupeHash, t.itemId) }));
export const extractions = pgTable('extractions', {
  id: text('id').primaryKey(), itemId: text('item_id').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull(), claimIds: jsonb('claim_ids').notNull(),
}, (t) => ({ item: uniqueIndex('extractions_item_idx').on(t.itemId) }));
export const settings = pgTable('settings', { id: text('id').primaryKey(), value: jsonb('value').notNull() });
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(), channel: text('channel').notNull(), messageId: text('message_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
