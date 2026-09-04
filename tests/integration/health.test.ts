import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { startTestDatabase, type TestDatabase } from '../setup/testcontainers.js';

describe('Health Integration Tests with Real PostgreSQL (Testcontainers)', () => {
  let testDb: TestDatabase;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
  }, 120_000);

  afterAll(async () => {
    setPool(originalPool);
    await testDb.stop();
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
    await testDb.stop();

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
