import { workspaceBrands, platformsForBrand } from '@newsroom/brands';
import { store } from '../../lib/store.ts';
import { AccountsBoard } from './board.tsx';

export const dynamic = 'force-dynamic';

const PLATFORM_ORDER = ['x', 'instagram', 'threads', 'tiktok'] as const;

export default async function AccountsPage() {
  const s = await store();
  const now = new Date();

  const groups = workspaceBrands(s).map((brand) => {
    const accounts = PLATFORM_ORDER.filter(p => platformsForBrand(s, brand.key).includes(p)).map((platform) => {
      const a = s.accounts.find((x) => x.brand === brand.key && x.platform === platform);
      const session = a ? s.sessions.find((x) => x.accountId === a.id) : undefined;
      return a ? {
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        warmupStage: a.warmupStage,
        dailyCap: a.dailyCap,
        active: a.active,
        needsSetup: /\.placeholder$/.test(a.handle),
        postsToday: s.postsPublishedToday(a.id, now),
        session: session ? { healthy: session.healthy, lastCheckAt: session.lastCheckAt } : null,
      } : null;
    }).filter((a): a is NonNullable<typeof a> => a !== null);

    return {
      key: brand.key,
      name: brand.name,
      vertical: brand.vertical,
      accounts,
      configuredCount: accounts.filter((a) => !a.needsSetup).length,
    };
  });

  const totalAccounts = groups.reduce((n, g) => n + g.accounts.length, 0);
  const totalConfigured = groups.reduce((n, g) => n + g.configuredCount, 0);

  return (
    <>
      <h1>Accounts</h1>
      <p className="lede">
        Set each account’s handle, warm-up stage, and daily publishing cap.
        <strong> {totalConfigured} of {totalAccounts}</strong> handles are configured.
      </p>
      <AccountsBoard groups={groups} />
    </>
  );
}
