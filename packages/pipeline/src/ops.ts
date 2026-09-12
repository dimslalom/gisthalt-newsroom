import type { Ctx } from './context.ts';
export function updateOps(ctx: Ctx, body: Record<string, unknown>) {
  switch (body.action) {
    case 'kill':
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be boolean');
      ctx.store.setSetting('killSwitch', body.enabled); return { ok: true };
    case 'account': {
      const a = ctx.store.getAccount(String(body.id));
      if (!a) throw new Error('account not found');
      const stage = Number(body.warmupStage), cap = Number(body.dailyCap);
      if (!Number.isInteger(stage) || stage < 0 || stage > 4 || !Number.isInteger(cap) || cap < 0 || cap > 16 || typeof body.active !== 'boolean') throw new Error('invalid account settings');
      return ctx.store.upsertAccount({ ...a, handle: String(body.handle ?? a.handle).slice(0,80), warmupStage: stage, dailyCap: cap, active: body.active });
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
