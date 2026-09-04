import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';

describe('Health Integration Tests with Real PostgreSQL (Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let testPool: pg.Pool;
  const originalPool = pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    testPool = new pg.Pool({
      connectionString: container.getConnectionUri(),
      max: 5,
      connectionTimeoutMillis: 2000,
    });
    testPool.on('error', () => {
      // Previne unhandled exception em clientes ociosos quando o container é derrubado
    });
    setPool(testPool);
  }, 120_000);

  afterAll(async () => {
    try {
      await testPool.end();
    } catch {
      // Ignora erro se o pool já estiver encerrado
    }
    setPool(originalPool);
    try {
      await container.stop();
    } catch {
      // Container já parado em T10
    }
  }, 30_000);

  // T9: /health/ready contra banco real de pé -> 200, database: 'up'
  it('T9: /health/ready returns status 200 with database: up against running container', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ready',
      database: 'up',
    });
  });

  // T10: /health/ready após derrubar o container -> 503, database: 'down'
  it('T10: /health/ready returns status 503 with database: down after container is stopped', async () => {
    await container.stop();

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });
});
