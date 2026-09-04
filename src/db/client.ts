import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

export let pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 2000,
});

pool.on('error', () => {
  // Previne unhandled error em clientes ociosos caso a conexão caia em background
});

export let db = drizzle(pool, { schema });
export type Database = typeof db;

export function setPool(newPool: pg.Pool): void {
  pool = newPool;
  pool.on('error', () => {
    // Previne unhandled error em clientes ociosos do novo pool
  });
  db = drizzle(pool, { schema });
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
