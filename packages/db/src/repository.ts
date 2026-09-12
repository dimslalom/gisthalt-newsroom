import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, eq, type Table } from 'drizzle-orm';
import { Store, STORE_KEYS } from './store.ts';
import * as schema from './schema.ts';

const tables = { ...schema, reviews: schema.reviewItems };
let client: ReturnType<typeof postgres> | undefined;
let serial: Promise<unknown> = Promise.resolve();
const filePath = () => resolve(process.env.STORE_FILE ?? resolve(resolve(fileURLToPath(import.meta.url), '..'), '../../../.data/store.json'));

/** A transaction owns a fresh unit of work. Services never cache database rows.
 * MVP deliberately serializes mutations with a database advisory lock; it is
 * inexpensive at newsroom volume and makes caps, approvals and job claims atomic.
 * Persist only changed rows in the normalized Drizzle schema.
 */
export async function withStore<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  if (process.env.DATABASE_URL && process.env.STORE_BACKEND !== 'file') {
    client ??= postgres(process.env.DATABASE_URL, { max: 5 });
    const db = drizzle(client);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(731204::bigint)`);
      const store = new Store();
      const raw: Record<string, unknown[]> = {};
      for (const key of STORE_KEYS) raw[key] = await tx.select().from(tables[key]);
      store.hydrate(raw);
      const before = new Map(STORE_KEYS.map((key) => [key, new Map(store.snapshot()[key]!.map((r: any) => [r.id, JSON.stringify(r)]))]));
      const result = await fn(store);
      for (const key of STORE_KEYS) {
        // All rows expose an id. The heterogeneous table map is the only dynamic
        // boundary; rows themselves retain their typed Store methods.
        const table = tables[key] as Table & { id: any };
        for (const row of store.snapshot()[key]!) {
          if (before.get(key)!.get(row.id) === JSON.stringify(row)) continue;
          await tx.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row });
        }
      }
      return result;
    });
  }
  // File mode is useful for an offline demo. A cross-process lock and atomic
  // rename prevent the dashboard, CLI and bot overwriting each other's changes.
  const work = serial.then(async () => {
    const file = filePath();
    await mkdir(dirname(file), { recursive: true });
    const lock = `${file}.lock`;
    const deadline = Date.now() + 120_000;
    for (;;) {
      try { await mkdir(lock); await writeFile(`${lock}/owner`, String(process.pid)); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        try {
          const pid = Number(await readFile(`${lock}/owner`, 'utf8'));
          if (pid > 0) {
            try { process.kill(pid, 0); }
            catch (err) { if ((err as NodeJS.ErrnoException).code === 'ESRCH') { await rm(lock, { recursive: true, force: true }); continue; } }
          }
        } catch { /* another process is creating the owner file */ }
        if (Date.now() > deadline) throw new Error(`store lock timed out: ${lock}`);
        await new Promise((r) => setTimeout(r, 40));
      }
    }
    try {
      const store = new Store();
      try { store.hydrate(JSON.parse(await readFile(file, 'utf8'))); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      const result = await fn(store);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(store.snapshot()));
      await rename(tmp, file);
      return result;
    } finally { await rm(lock, { recursive: true, force: true }); }
  });
  serial = work.catch(() => {});
  return work;
}

/** Dashboard snapshots never wait behind a network stage's write lock. */
export async function readStore(): Promise<Store> {
  const store = new Store();
  if (process.env.DATABASE_URL && process.env.STORE_BACKEND !== 'file') {
    client ??= postgres(process.env.DATABASE_URL, { max: 5 });
    return drizzle(client).transaction(async tx => {
      const raw: Record<string, unknown[]> = {};
      for (const key of STORE_KEYS) raw[key] = await tx.select().from(tables[key]);
      store.hydrate(raw); return store;
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }
  try { store.hydrate(JSON.parse(await readFile(filePath(), 'utf8'))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  return store;
}
export async function closeDatabase(): Promise<void> { await client?.end(); client = undefined; }
