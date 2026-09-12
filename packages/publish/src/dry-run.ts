import type { Platform, PublishAdapter, PublishRequest, PublishResult, SessionHealth } from '@newsroom/core';

/**
 * The MVP publisher. Does everything the browser adapter does except touch a
 * platform: proves the pipeline end to end while the warm-up clock runs and
 * nothing is allowed to post for real yet.
 */
export class DryRunAdapter implements PublishAdapter {
  readonly platform: Platform;
  constructor(platform: Platform) { this.platform = platform; }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 40));
    return {
      ok: true,
      platformPostId: `dryrun_${req.idempotencyKey.slice(0, 12)}`,
      url: `dryrun://${this.platform}/${req.accountId}`,
      latencyMs: Date.now() - started,
    };
  }

  async checkSession(accountId: string): Promise<SessionHealth> {
    return { accountId, healthy: true, checkedAt: new Date(), detail: 'dry-run adapter: always healthy' };
  }
}
