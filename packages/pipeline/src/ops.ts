import type { Ctx } from './context.ts';
import type { Store } from '@newsroom/db';
import { workspaceBrand, platformsForBrand, accountPlatforms, brandForVertical } from '@newsroom/brands';
import { seedAccounts } from './seed.ts';

export type ReadinessLevel = 'pass' | 'warn' | 'fail';
export interface ReadinessCheck { key: string; level: ReadinessLevel; message: string }
export interface ReadinessReport { level: ReadinessLevel; generatedAt: string; mode: 'dry-run' | 'live'; checks: ReadinessCheck[] }
const HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000;
const heartbeatLevel = (at: Date | null, now: Date): ReadinessLevel => !at || !Number.isFinite(at.getTime()) || now.getTime() - at.getTime() > HEARTBEAT_MAX_AGE_MS ? 'fail' : 'pass';

/** Read-only launch gate for the Ops UI and health probes. Never changes safety settings. */
export function assessReadiness(store: Store, options: { now?: Date; rendererUp: boolean; dryRun?: boolean }): ReadinessReport {
  const now = options.now ?? new Date();
  const mode = options.dryRun === false ? 'live' : 'dry-run';
  const checks: ReadinessCheck[] = [{ key: 'renderer', level: options.rendererUp ? 'pass' : 'fail', message: options.rendererUp ? 'Renderer is reachable.' : 'Renderer is unavailable.' }];
  const workerValue = store.setting<Date | string | null>('workerHeartbeat', null);
  const workerAt = workerValue ? new Date(workerValue) : null;
  checks.push({ key: 'worker', level: heartbeatLevel(workerAt, now), message: workerAt ? 'Worker heartbeat is current.' : 'No worker heartbeat recorded.' });
  const activeSources = store.sources.filter((source) => source.active);
  const healthySources = activeSources.filter((source) => source.lastSuccessAt && now.getTime() - source.lastSuccessAt.getTime() <= 2 * source.cadenceSeconds * 1000);
  checks.push({ key: 'sources', level: activeSources.length === 0 ? 'warn' : healthySources.length === activeSources.length ? 'pass' : 'warn', message: activeSources.length === 0 ? 'No active sources configured.' : `${healthySources.length}/${activeSources.length} active sources are within cadence.` });
  const uncertain = store.posts.filter((post) => ['publishing', 'uncertain', 'retraction_requested'].includes(post.status));
  checks.push({ key: 'reconciliation', level: uncertain.length ? 'fail' : 'pass', message: uncertain.length ? `${uncertain.length} post(s) need owner reconciliation.` : 'No interrupted or uncertain submissions.' });
  if (mode === 'dry-run') checks.push({ key: 'publishing-mode', level: 'pass', message: 'Dry-run mode is active; no platform submission can occur.' });
  else {
    const agentValue = store.setting<Date | string | null>('agentHeartbeat', null);
    const agentAt = agentValue ? new Date(agentValue) : null;
    checks.push({ key: 'agent', level: heartbeatLevel(agentAt, now), message: agentAt ? 'Native publishing agent heartbeat is current.' : 'No native publishing agent heartbeat recorded.' });
    const accounts = store.accounts.filter((account) => account.active);
    const invalid = accounts.filter((account) => /placeholder/i.test(account.handle) || account.warmupStage < 1 || account.dailyCap < 1 || !account.profileDir);
    const unhealthySessions = accounts.filter((account) => { const session = store.sessions.find((row) => row.accountId === account.id); return !session?.healthy || !session.lastCheckAt || now.getTime() - session.lastCheckAt.getTime() > HEARTBEAT_MAX_AGE_MS; });
    checks.push({ key: 'accounts', level: accounts.length === 0 || invalid.length ? 'fail' : 'pass', message: accounts.length === 0 ? 'No live accounts are enabled.' : invalid.length ? `${invalid.length} enabled account(s) are incomplete or not warmed up.` : `${accounts.length} enabled account(s) are configured.` });
    checks.push({ key: 'sessions', level: unhealthySessions.length ? 'fail' : 'pass', message: unhealthySessions.length ? `${unhealthySessions.length} enabled account session(s) are unhealthy or stale.` : 'Every enabled account session is healthy.' });
  }
  const level: ReadinessLevel = checks.some((check) => check.level === 'fail') ? 'fail' : checks.some((check) => check.level === 'warn') ? 'warn' : 'pass';
  return { level, generatedAt: now.toISOString(), mode, checks };
}

export function updateOps(ctx: Ctx, body: Record<string, unknown>) {
  switch (body.action) {
    case 'brand': {
      const brand = workspaceBrand(ctx.store, String(body.key));
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) throw new Error('brand name must be 1–80 characters');
      const vertical = brandForVertical(String(body.vertical)).vertical;
      if (vertical !== brand.vertical) {
        const accounts = ctx.store.accounts.filter(a => a.brand === brand.key);
        if (ctx.store.posts.some(p => accounts.some(a => a.id === p.accountId) && ['publishing','uncertain','retraction_requested'].includes(p.status))) throw new Error('reconcile in-flight posts before changing content type');
        for (const a of accounts) a.active = false;
        for (const p of ctx.store.posts.filter(p => accounts.some(a => a.id === p.accountId) && ['ready','held','failed'].includes(p.status))) { p.status = 'cancelled'; p.error = 'brand content type changed'; }
      }
      ctx.store.setSetting(`brand:${brand.key}`, { ...brand, name, vertical });
      return { ok: true };
    }
    case 'platform_add':
    case 'platform_remove': {
      const brand = workspaceBrand(ctx.store, String(body.key));
      const platform = accountPlatforms.find(p => p === body.platform);
      if (!platform) throw new Error('unsupported platform');
      const platforms = platformsForBrand(ctx.store, brand.key);
      if (body.action === 'platform_add') {
        ctx.store.setSetting(`brandPlatforms:${brand.key}`, [...new Set([...platforms, platform])]);
        seedAccounts(ctx);
      } else {
        const account = ctx.store.accounts.find(a => a.brand === brand.key && a.platform === platform);
        if (account && ctx.store.posts.some(p => p.accountId === account.id && ['publishing','uncertain','retraction_requested'].includes(p.status))) throw new Error('reconcile in-flight posts before removing this platform');
        ctx.store.setSetting(`brandPlatforms:${brand.key}`, platforms.filter(p => p !== platform));
        if (account) {
          account.active = false;
          for (const p of ctx.store.posts.filter(p => p.accountId === account.id && ['ready','held','failed'].includes(p.status))) { p.status = 'cancelled'; p.error = 'platform removed'; }
        }
      }
      return { ok: true };
    }
    case 'kill':
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be boolean');
      ctx.store.setSetting('killSwitch', body.enabled); return { ok: true };
    case 'account': {
      const a = ctx.store.getAccount(String(body.id));
      if (!a) throw new Error('account not found');
      if (!platformsForBrand(ctx.store, a.brand).includes(a.platform)) throw new Error('platform has been removed');
      const stage = Number(body.warmupStage), cap = Number(body.dailyCap);
      if (!Number.isInteger(stage) || stage < 0 || stage > 4 || !Number.isInteger(cap) || cap < 0 || cap > 16 || typeof body.active !== 'boolean') throw new Error('invalid account settings');
      const handle = String(body.handle ?? a.handle).trim().slice(0, 80);
      const stageCaps = [0, 3, 6, 9, 16];
      if (cap > stageCaps[stage]!) throw new Error(`daily cap exceeds warm-up stage ${stage}`);
      if (body.active && (!/^@[^\s]+$/.test(handle) || /placeholder/i.test(handle) || stage < 1 || cap < 1)) {
        throw new Error('an active account needs a real @handle, warm-up stage 1 or higher, and a positive cap');
      }
      return ctx.store.upsertAccount({ ...a, handle, warmupStage: stage, dailyCap: cap, active: body.active });
    }
    case 'source': {
      const s = ctx.store.getSource(String(body.key));
      if (!s || typeof body.active !== 'boolean') throw new Error('invalid source');
      s.active = body.active; return s;
    }
    case 'retry': {
      const p=ctx.store.posts.find(p=>p.id===body.id);
      if(!p || p.status!=='failed')throw new Error('only definite pre-submit failures can retry');
      p.status='ready';p.scheduledFor=ctx.now();p.error=null;return p;
    }
    case 'reconcile': {
      const p = ctx.store.posts.find((p) => p.id === body.id);
      if (!p || !['publishing','uncertain','retraction_requested','failed'].includes(p.status)) throw new Error('post does not need reconciliation');
      if (body.outcome === 'published') {
        if (typeof body.platformPostId !== 'string' || !body.platformPostId.trim()) throw new Error('confirmed platform URL or ID required');
        p.status = 'published'; p.platformPostId = body.platformPostId; p.publishedAt = ctx.now();
      } else if (body.outcome === 'removed') p.status = 'retracted';
      else if (body.outcome === 'not_published') p.status = 'cancelled';
      else throw new Error('invalid reconciliation outcome');
      p.error = 'manually reconciled by owner'; return p;
    }
    default: throw new Error('unknown ops action');
  }
}
