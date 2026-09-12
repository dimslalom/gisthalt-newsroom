import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  AccountRow, ClaimRow, CompositionRow, DecisionRow, EventRow, ItemRow, LlmCacheRow,
  ModelUsageRow, PostRow, PostStatus, ReviewRow, SessionRow, SourceRow,
} from './types.ts';

export const id = () => randomUUID();

/**
 * The MVP store. Everything lives in memory and is persisted to one JSON file
 * so a restart resumes rather than loses. The interface is deliberately the
 * shape a Postgres implementation will take: the schema in schema.ts is the
 * canonical definition and this is the swappable implementation behind it.
 */
export class Store {
  items: ItemRow[] = [];
  claims: ClaimRow[] = [];
  decisions: DecisionRow[] = [];
  compositions: CompositionRow[] = [];
  posts: PostRow[] = [];
  accounts: AccountRow[] = [];
  sessions: SessionRow[] = [];
  modelUsage: ModelUsageRow[] = [];
  sources: SourceRow[] = [];
  reviews: ReviewRow[] = [];
  events: EventRow[] = [];
  llmCache: LlmCacheRow[] = [];

  evidence: { id: string; dedupeHash: string; itemId: string; domain: string; tier: string; observedAt: Date; admissible: boolean }[] = [];
  extractions: { id: string; itemId: string; processedAt: Date; claimIds: string[] }[] = [];
  settings: { id: string; value: unknown }[] = [];
  notifications: { id: string; channel: string; messageId: string; updatedAt: Date }[] = [];

  private saveTimer: NodeJS.Timeout | null = null;

  private readonly file: string | null;

  constructor(file: string | null = null) {
    this.file = file;
    if (file && existsSync(file)) this.load();
  }

  // ---- persistence -------------------------------------------------------

  private load(): void {
    this.hydrate(JSON.parse(readFileSync(this.file!, 'utf8')));
  }

  hydrate(raw: Record<string, any>): void {
    const revive = <T>(rows: unknown[], dateKeys: string[]): T[] =>
      (rows as Record<string, unknown>[]).map((r) => {
        for (const k of dateKeys) if (r[k]) r[k] = new Date(r[k] as string);
        return r as T;
      });
    this.items = revive<ItemRow>(raw.items ?? [], ['fetchedAt', 'observedAt']);
    this.claims = revive<ClaimRow>(raw.claims ?? [], ['observedAt', 'createdAt']);
    this.decisions = revive<DecisionRow>(raw.decisions ?? [], ['decidedAt']);
    this.compositions = revive<CompositionRow>(raw.compositions ?? [], ['renderedAt', 'createdAt']);
    this.posts = revive<PostRow>(raw.posts ?? [], ['scheduledFor', 'publishedAt']);
    this.accounts = (raw.accounts ?? []) as AccountRow[];
    this.sessions = revive<SessionRow>(raw.sessions ?? [], ['lastOkAt', 'lastCheckAt']);
    this.modelUsage = (raw.modelUsage ?? []) as ModelUsageRow[];
    this.sources = revive<SourceRow>(raw.sources ?? [], ['lastSuccessAt', 'lastErrorAt']);
    this.reviews = revive<ReviewRow>(raw.reviews ?? [], ['createdAt', 'expiresAt', 'resolvedAt']);
    this.events = revive<EventRow>(raw.events ?? [], ['at']);
    this.llmCache = revive<LlmCacheRow>(raw.llmCache ?? [], ['createdAt']);
    this.evidence = revive(raw.evidence ?? [], ['observedAt']);
    this.extractions = revive(raw.extractions ?? [], ['processedAt']);
    this.settings = raw.settings ?? [];
    this.notifications = revive(raw.notifications ?? [], ['updatedAt']);
  }

  /** Debounced so a pipeline run writes once, not once per insert. */
  save(): void {
    if (!this.file) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 150);
    this.saveTimer.unref?.();
  }

  saveNow(): void {
    if (!this.file) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(this.snapshot()));
    renameSync(temp, this.file);
  }

  snapshot(): Record<string, any[]> {
    return Object.fromEntries(STORE_KEYS.map((key) => [key, this[key]]));
  }

  setting<T>(key: string, fallback: T): T {
    return (this.settings.find((r) => r.id === key)?.value as T | undefined) ?? fallback;
  }

  setSetting(key: string, value: unknown): void {
    const row = this.settings.find((r) => r.id === key);
    if (row) row.value = value; else this.settings.push({ id: key, value });
    this.save();
  }

  // ---- items -------------------------------------------------------------

  /** Returns null when the exact content was already stored. */
  insertItem(row: Omit<ItemRow, 'id'>): ItemRow | null {
    if (this.items.some((i) => i.contentHash === row.contentHash)) return null;
    const r: ItemRow = { id: id(), ...row };
    this.items.push(r);
    this.save();
    return r;
  }

  getItem(itemId: string): ItemRow | undefined { return this.items.find((i) => i.id === itemId); }

  /** Pre-extraction dedupe: has anything equivalent arrived recently? */
  findRecentByPreKey(preKey: string, withinMs: number, now: Date): ItemRow[] {
    const cutoff = now.getTime() - withinMs;
    return this.items.filter((i) => i.preKey === preKey && i.fetchedAt.getTime() >= cutoff);
  }

  // ---- claims ------------------------------------------------------------

  /** Idempotent on dedupeHash. Second outlet asserting the same fact is free. */
  upsertClaim(row: Omit<ClaimRow, 'id'>): { claim: ClaimRow; created: boolean } {
    if (!this.evidence.some((e) => e.dedupeHash === row.dedupeHash && e.itemId === row.itemId)) {
      this.evidence.push({ id: id(), dedupeHash: row.dedupeHash, itemId: row.itemId, domain: row.sourceDomain, tier: row.sourceTier, observedAt: row.observedAt, admissible: !row.tags.some(t=>t==='unextracted'||t.startsWith('quote:')) });
      this.save();
    }
    const existing = this.claims.find((c) => c.dedupeHash === row.dedupeHash);
    if (existing) return { claim: existing, created: false };
    const r: ClaimRow = { id: id(), ...row };
    this.claims.push(r);
    this.save();
    return { claim: r, created: true };
  }

  getClaim(claimId: string): ClaimRow | undefined { return this.claims.find((c) => c.id === claimId); }

  /** Every independent domain that has asserted this hash, for R3. */
  corroborationFor(dedupeHash: string, excludeItemId: string): { itemId: string; domain: string; observedAt: Date }[] {
    return this.evidence.filter((e) => e.dedupeHash === dedupeHash && e.itemId !== excludeItemId && e.tier === 'B' && e.admissible !== false);
  }

  // ---- decisions ---------------------------------------------------------

  insertDecision(row: Omit<DecisionRow, 'id'>): DecisionRow {
    const r: DecisionRow = { id: id(), ...row };
    this.decisions.push(r);
    this.save();
    return r;
  }

  decisionsFor(claimId: string): DecisionRow[] { return this.decisions.filter((d) => d.claimId === claimId); }

  // ---- compositions ------------------------------------------------------

  insertComposition(row: Omit<CompositionRow, 'id'>): CompositionRow {
    const r: CompositionRow = { id: id(), ...row };
    this.compositions.push(r);
    this.save();
    return r;
  }

  updateComposition(compositionId: string, patch: Partial<CompositionRow>): CompositionRow | undefined {
    const c = this.compositions.find((x) => x.id === compositionId);
    if (c) { Object.assign(c, patch); this.save(); }
    return c;
  }

  getComposition(compositionId: string): CompositionRow | undefined {
    return this.compositions.find((c) => c.id === compositionId);
  }

  /** The last N compositions for an account, newest first. Feeds the shuffle bag. */
  recentCompositions(accountId: string, n = 12): CompositionRow[] {
    return this.compositions
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, n);
  }

  // ---- posts -------------------------------------------------------------

  insertPost(row: Omit<PostRow, 'id'>): PostRow | null {
    if (this.posts.some((p) => p.idempotencyKey === row.idempotencyKey)) return null;
    const r: PostRow = { id: id(), ...row };
    this.posts.push(r);
    this.save();
    return r;
  }

  /** Claim one ready job. The status flip is the lock: a restart never double-posts. */
  claimNextReadyPost(now: Date): PostRow | null {
    const p = this.posts
      .filter((x) => x.status === 'ready' && (!x.scheduledFor || x.scheduledFor.getTime() <= now.getTime()))
      .sort((a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0))[0];
    if (!p) return null;
    p.status = 'publishing';
    this.saveNow();
    return p;
  }

  updatePost(postId: string, patch: Partial<PostRow>): PostRow | undefined {
    const p = this.posts.find((x) => x.id === postId);
    if (p) { Object.assign(p, patch); this.save(); }
    return p;
  }

  postsPublishedToday(accountId: string, now: Date): number {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return this.posts.filter((p) =>
      p.accountId === accountId && (p.status === 'published' || p.status === 'simulated') &&
      p.publishedAt && p.publishedAt.getTime() >= start.getTime()).length;
  }

  /**
   * What the daily cap must actually count: anything already out plus anything
   * committed to going out today. Counting only published posts lets a single
   * tick queue a week of volume and blow the cap the moment the agent drains it.
   */
  postsCommittedToday(accountId: string, now: Date): number {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return this.posts.filter((p) => {
      if (p.accountId !== accountId) return false;
      if ((p.status === 'published' || p.status === 'simulated')) return p.publishedAt !== null && p.publishedAt.getTime() >= start.getTime();
      if (p.status === 'ready' || p.status === 'publishing') {
        const at = p.scheduledFor ?? now;
        return at.getTime() >= start.getTime() && at.getTime() < end.getTime();
      }
      return false;
    }).length;
  }

  // ---- accounts, sessions ------------------------------------------------

  upsertAccount(row: AccountRow): AccountRow {
    const i = this.accounts.findIndex((a) => a.id === row.id);
    if (i >= 0) this.accounts[i] = row; else this.accounts.push(row);
    this.save();
    return row;
  }

  getAccount(accountId: string): AccountRow | undefined { return this.accounts.find((a) => a.id === accountId); }

  upsertSession(row: Omit<SessionRow, 'id'>): SessionRow {
    const existing = this.sessions.find((s) => s.accountId === row.accountId);
    if (existing) { Object.assign(existing, row); this.save(); return existing; }
    const r: SessionRow = { id: id(), ...row };
    this.sessions.push(r);
    this.save();
    return r;
  }

  // ---- model usage (token buckets) --------------------------------------

  usage(model: string, day: string, minute: string): ModelUsageRow {
    let r = this.modelUsage.find((u) => u.model === model && u.day === day && u.minute === minute);
    if (!r) {
      r = { id: id(), model, day, minute, requestCount: 0, tokenCount: 0 };
      this.modelUsage.push(r);
    }
    return r;
  }

  requestsToday(model: string, day: string): number {
    return this.modelUsage.filter((u) => u.model === model && u.day === day)
      .reduce((a, u) => a + u.requestCount, 0);
  }

  // ---- sources -----------------------------------------------------------

  upsertSource(row: Omit<SourceRow, 'id'>): SourceRow {
    const existing = this.sources.find((s) => s.key === row.key);
    if (existing) { Object.assign(existing, { ...row, id: existing.id }); this.save(); return existing; }
    const r: SourceRow = { id: id(), ...row };
    this.sources.push(r);
    this.save();
    return r;
  }

  getSource(key: string): SourceRow | undefined { return this.sources.find((s) => s.key === key); }

  // ---- review queue ------------------------------------------------------

  insertReview(row: Omit<ReviewRow, 'id'>): ReviewRow {
    const r: ReviewRow = { id: id(), ...row };
    this.reviews.push(r);
    this.save();
    return r;
  }

  getReview(reviewId: string): ReviewRow | undefined { return this.reviews.find((r) => r.id === reviewId); }

  pendingReviews(now: Date): ReviewRow[] {
    return this.reviews
      .filter((r) => (r.state === 'pending' || r.state === 'held') && r.expiresAt.getTime() > now.getTime())
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  }

  /** A stale queue looks busy without being busy. Expire, do not accumulate. */
  expireStaleReviews(now: Date): ReviewRow[] {
    const expired = this.reviews.filter((r) => (r.state === 'pending' || r.state === 'held') && r.expiresAt.getTime() <= now.getTime());
    for (const r of expired) {
      r.state = 'expired';
      r.resolvedAt = now;
      r.note = 'auto-rejected: expired unapproved';
    }
    if (expired.length) this.save();
    return expired;
  }

  resolveReview(reviewId: string, state: ReviewRow['state'], now: Date, note?: string): ReviewRow | undefined {
    const r = this.reviews.find((x) => x.id === reviewId);
    if (!r) return undefined;
    r.state = state;
    r.resolvedAt = state === 'held' ? null : now;
    if (note) r.note = note;
    this.save();
    return r;
  }

  // ---- llm cache ---------------------------------------------------------

  cacheGet(cacheKey: string): LlmCacheRow | undefined { return this.llmCache.find((c) => c.cacheKey === cacheKey); }

  cacheSet(cacheKey: string, model: string, response: unknown, now: Date): void {
    const existing = this.llmCache.find((c) => c.cacheKey === cacheKey);
    if (existing) { existing.response = response; existing.model = model; }
    else this.llmCache.push({ id: id(), cacheKey, model, response, createdAt: now });
    this.save();
  }

  // ---- events ------------------------------------------------------------

  /** One structured line per pipeline stage transition, carrying the dedupeHash
   *  so a post can be traced end to end. */
  log(e: Omit<EventRow, 'id' | 'at'> & { at?: Date }): EventRow {
    const r: EventRow = { id: id(), at: e.at ?? new Date(), ...e } as EventRow;
    this.events.push(r);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      t: r.at.toISOString(), lvl: r.level, stage: r.stage, msg: r.msg,
      hash: r.dedupeHash?.slice(0, 12), ...r.meta,
    }));
    this.save();
    return r;
  }

  recentEvents(n = 200): EventRow[] { return this.events.slice(-n).reverse(); }
}

let singleton: Store | null = null;

export function getStore(file = process.env.STORE_FILE ?? resolve(resolve(fileURLToPath(import.meta.url), '..'), '../../../.data/store.json')): Store {
  if (!singleton) singleton = new Store(file);
  return singleton;
}

export const STORE_KEYS = ['items', 'claims', 'decisions', 'compositions', 'posts', 'accounts', 'sessions', 'modelUsage', 'sources', 'reviews', 'events', 'llmCache', 'evidence', 'extractions', 'settings', 'notifications'] as const;
