import { brands } from '@newsroom/brands';
import type { Ctx } from './context.ts';
export function seedAccounts(ctx: Ctx): void {
  for (const brand of brands) for (const platform of ['x','instagram','threads','tiktok'] as const) {
    const id = `${brand.key}-${platform}`;
    if (ctx.store.getAccount(id)) continue;
    ctx.store.upsertAccount({ id, brand: brand.key, handle: `@${brand.key}.placeholder`, platform,
      profileDir: `${process.env.AGENT_PROFILE_ROOT ?? './.data/profiles'}/${id}`,
      warmupStage: 0, dailyCap: 0, active: false });
  }
}
