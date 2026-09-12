import type { Platform, PublishAdapter } from '@newsroom/core';
import { DryRunAdapter } from './dry-run.ts';
import { SocialBrowserAdapter } from './browser/social.ts';
export * from './pacing.ts';
export * from './archive.ts';
export * from './dry-run.ts';
export * from './browser/x.ts';
export * from './browser/social.ts';
const adapters = new Map<string, PublishAdapter>();
export function adapterFor(platform: Platform): PublishAdapter {
  const dryRun = process.env.PUBLISH_DRY_RUN !== 'false';
  const key = `${platform}:${dryRun}`;
  if (!adapters.has(key)) adapters.set(key, dryRun ? new DryRunAdapter(platform) : new SocialBrowserAdapter(platform));
  return adapters.get(key)!;
}
