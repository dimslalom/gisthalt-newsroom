import { withCtx, seedAccounts } from '@newsroom/pipeline';
import { closeDatabase } from '@newsroom/db';
await withCtx(seedAccounts);
await closeDatabase();
console.log('Missing accounts seeded in manual warm-up mode. Existing account settings preserved.');
