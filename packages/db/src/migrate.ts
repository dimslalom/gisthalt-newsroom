import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migrations');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: resolve(resolve(fileURLToPath(import.meta.url), '..'), '../migrations') });
  console.log('Database migrations applied.');
} finally { await client.end(); }
