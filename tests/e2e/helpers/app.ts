import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { setPool, type Database } from '../../../src/db/client.js';
import { seed } from '../../../src/db/seed/seed.js';
import { startTestDatabase, type TestDatabase } from '../../setup/testcontainers.js';

let sharedTestDb: TestDatabase | null = null;
let sharedTestDbPromise: Promise<TestDatabase> | null = null;

export interface TestAppContext {
  app: FastifyInstance;
  db: Database;
  stop: () => Promise<void>;
}

/**
 * Constrói a aplicação Fastify para testes E2E conectada a uma instância única
 * e compartilhada do PostgreSQL 17 (via Testcontainers) para toda a suíte.
 * O container é iniciado de forma singleton no primeiro teste e reutilizado nos
 * demais graças ao modo singleFork do Vitest, garantindo execução ultrarrápida (< 45s).
 */
export async function buildTestApp(): Promise<TestAppContext> {
  if (!sharedTestDb) {
    if (!sharedTestDbPromise) {
      sharedTestDbPromise = startTestDatabase();
    }
    sharedTestDb = await sharedTestDbPromise;
    process.env.DATABASE_URL = sharedTestDb.connectionString;
    setPool(sharedTestDb.pool);
  }

  // Garante que o catálogo inicial esteja semeado para o teste
  await seed(sharedTestDb.db);

  const app = await buildApp();
  await app.ready();

  const stop = async (): Promise<void> => {
    await app.close();
  };

  return {
    app,
    db: sharedTestDb.db,
    stop,
  };
}

// Encerra graciosamente o container do Testcontainers no final do processo
process.once('beforeExit', () => {
  if (sharedTestDb) {
    void sharedTestDb.stop().catch(() => {
      // Ignora erro no encerramento automático do processo
    });
    sharedTestDb = null;
    sharedTestDbPromise = null;
  }
});
