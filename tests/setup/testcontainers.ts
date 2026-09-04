import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { Database } from '../../src/db/client.js';
import * as schema from '../../src/db/schema/index.js';

export interface TestDatabase {
  db: Database;
  pool: pg.Pool;
  connectionString: string;
  stop: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();
  const connectionString = container.getConnectionUri();

  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', () => {
    // Previne unhandled exception em clientes ociosos caso a conexão seja encerrada
  });

  const db = drizzle(pool, { schema });

  await migrate(db, { migrationsFolder: './drizzle' });

  let isStopped = false;
  const stop = async (): Promise<void> => {
    if (isStopped) {
      return;
    }
    isStopped = true;

    try {
      await pool.end();
    } catch {
      // Ignora erro se o pool já estiver encerrado
    }

    try {
      await container.stop();
    } catch {
      // Ignora erro se o container já estiver parado
    }
  };

  return {
    db,
    pool,
    connectionString,
    stop,
  };
}

export async function truncateAll(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE "user", session, account, verification, artists, tracks, playlists, playlist_tracks, favorites RESTART IDENTITY CASCADE;`,
  );
}
