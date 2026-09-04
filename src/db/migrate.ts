import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { env } from '../config/env.js';

async function runMigrations(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  const db = drizzle(pool);

  try {
    process.stdout.write('[Database Migration] Starting database migration...\n');
    await migrate(db, { migrationsFolder: './drizzle' });
    process.stdout.write('[Database Migration] Database migration completed successfully.\n');
    await pool.end();
    process.exit(0);
  } catch (error: unknown) {
    process.stderr.write(
      `[Database Migration Error] Failed to apply migrations: ${String(error)}\n`,
    );
    await pool.end();
    process.exit(1);
  }
}

void runMigrations();
