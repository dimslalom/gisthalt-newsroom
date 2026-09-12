import { createHash } from 'node:crypto';
import type { Store } from '@newsroom/db';
import { loadLimits, type ModelLimit } from './limits.ts';

export type Purpose = 'classify' | 'extract' | 'copy' | 'adjudicate';

const PURPOSE_MODEL: Record<Purpose, string> = {
  classify: 'gemini-flash-lite-latest',
  extract: 'gemini-flash-lite-latest',
  copy: 'gemini-flash-latest',
  adjudicate: 'gemini-pro-latest',
};

export class BudgetExhausted extends Error {
  readonly purpose: Purpose;
  constructor(purpose: Purpose) {
    super(`no model available for ${purpose}: every bucket in the ladder is empty`);
    this.purpose = purpose;
  }
}

export interface CallOptions {
  purpose: Purpose;
  prompt: string;
  /** Cache key basis. Caption copy is cached by claim hash, so a reshuffle costs nothing. */
  cacheKey?: string;
  json?: boolean;
  maxOutputTokens?: number;
}

export interface CallResult<T = unknown> {
  text: string;
  json: T | null;
  model: string;
  cached: boolean;
  /** True when no key was configured and the deterministic offline stub answered. */
  offline: boolean;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const minuteKey = (d: Date) => d.toISOString().slice(0, 16);

/**
 * Model router. Persists counts in modelUsage so a restart does not reset the
 * daily count, walks the fallback ladder on exhaustion, and caches by key.
 */
export class GeminiRouter {
  private readonly limits: ModelLimit[] = loadLimits();

  private readonly store: Store;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(
    store: Store,
    apiKey: string | undefined = process.env.GEMINI_API_KEY,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.store = store;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  get live(): boolean { return Boolean(this.apiKey); }

  private available(model: string, now: Date): boolean {
    const lim = this.limits.find((l) => l.model === model);
    if (!lim) return false;
    if (this.store.requestsToday(model, dayKey(now)) >= lim.rpd) return false;
    return this.store.usage(model, dayKey(now), minuteKey(now)).requestCount < lim.rpm;
  }

  /** The ladder: first model with budget wins, then its fallback, and so on. */
  pickModel(purpose: Purpose, now = new Date()): string | null {
    let model: string | null = this.limits.find((l) => l.role.split('|').includes(purpose))?.model ?? null;
    const seen = new Set<string>();
    while (model && !seen.has(model)) {
      seen.add(model);
      if (this.available(model, now)) return model;
      model = this.limits.find((l) => l.model === model)?.fallback ?? null;
    }
    return null;
  }

  async call<T = unknown>(opts: CallOptions, now = new Date()): Promise<CallResult<T>> {
    const key = opts.cacheKey ?? createHash('sha256').update(`${opts.purpose}\n${opts.prompt}`).digest('hex');
    const cached = this.store.cacheGet(key);
    if (cached) {
      const payload = cached.response as { text: string; json: T | null };
      return { ...payload, model: cached.model, cached: true, offline: false };
    }

    if (!this.apiKey) return { text: '', json: null, model: 'none', cached: false, offline: true };
    let model = this.pickModel(purpose(opts), now);
    if (!model) return { text: '', json: null, model: 'none', cached: false, offline: true };

    let out: { text: string; json: T | null };
    let offline = false;

    if (!this.apiKey) {
      out = { text: '', json: null };
      offline = true; // Caller falls back to template-only copy.
    } else {
      const usage = this.store.usage(model, dayKey(now), minuteKey(now));
      usage.requestCount += 1;
      let res: Response;
      for (;;) {
      res = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST', signal: AbortSignal.timeout(30000),
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: opts.maxOutputTokens ?? 512,
              ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        },
      );
      if (res.status !== 429 && res.status < 500) break;
      const fallback = this.limits.find((l) => l.model === model)?.fallback;
      if (!fallback || !this.available(fallback, now)) return { text: '', json: null, model, cached: false, offline: true };
      model = fallback;
      this.store.usage(model, dayKey(now), minuteKey(now)).requestCount++;
      this.store.save();
      }
      if (!res.ok) throw new Error(`gemini ${model}: ${res.status}`);
      const body = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { totalTokenCount?: number } };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      this.store.usage(model, dayKey(now), minuteKey(now)).tokenCount += body.usageMetadata?.totalTokenCount ?? 0;
      out = { text, json: opts.json ? safeJson<T>(text) : null };
      this.store.save();
    }

    if (!offline) this.store.cacheSet(key, model, out, now);
    return { ...out, model, cached: false, offline };
  }
}

const purpose = (o: CallOptions): Purpose => o.purpose;

export function safeJson<T>(text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(trimmed) as T; } catch { return null; }
}
