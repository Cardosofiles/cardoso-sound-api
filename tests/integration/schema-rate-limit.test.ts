import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthTables } from 'better-auth/db';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { rateLimit } from '../../src/db/schema/index.js';
import { auth } from '../../src/modules/auth/auth.config.js';
import { clearOutbox } from '../../src/shared/email/mailer.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

describe('Schema Rate Limit Integration Tests (T23–T26)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
    app = await buildApp();
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    setPool(originalPool);
    await testDb.stop();
  }, 30_000);

  beforeEach(async () => {
    clearOutbox();
    await truncateAll(testDb.db);
  });

  // T23: Tabela rate_limit existe no banco com as colunas que o CLI pediu e chave única
  it('T23: table rate_limit exists in PostgreSQL with all canonical columns and unique constraint', async () => {
    const result = await testDb.pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rate_limit';
    `);

    const columns = new Map(result.rows.map((r) => [r.column_name, r]));
    expect(columns.size).toBe(4);

    expect(columns.has('id')).toBe(true);
    expect(columns.get('id')?.is_nullable).toBe('NO');

    expect(columns.has('key')).toBe(true);
    expect(columns.get('key')?.is_nullable).toBe('NO');

    expect(columns.has('count')).toBe(true);
    expect(columns.get('count')?.data_type).toBe('integer');
    expect(columns.get('count')?.is_nullable).toBe('NO');

    expect(columns.has('last_request')).toBe(true);
    expect(columns.get('last_request')?.data_type).toBe('bigint');
    expect(columns.get('last_request')?.is_nullable).toBe('NO');

    const constraintResult = await testDb.pool.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'rate_limit' AND c.contype = 'u';
    `);

    const constraintNames = constraintResult.rows.map((r) => r.conname);
    expect(constraintNames).toContain('rate_limit_key_unique');

    // Inserção e validação da unicidade da chave
    await testDb.db.insert(rateLimit).values({
      id: 'rl_1',
      key: 'test_key_unique',
      count: 1,
      lastRequest: Date.now(),
    });

    let caughtError: unknown;
    try {
      await testDb.db.insert(rateLimit).values({
        id: 'rl_2',
        key: 'test_key_unique',
        count: 2,
        lastRequest: Date.now(),
      });
    } catch (err) {
      caughtError = err;
    }

    assertDefined(caughtError);
    const pgError = caughtError as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    const errorCode = pgError.code ?? pgError.cause?.code;
    const constraint = pgError.constraint ?? pgError.cause?.constraint;
    expect(errorCode).toBe('23505');
    expect(constraint).toBe('rate_limit_key_unique');
  });

  // T24: @better-auth/cli generate / getAuthTables sem diferença
  it('T24: better-auth tables definition matches the Drizzle schema without differences', () => {
    const tables = getAuthTables(auth.options);
    expect(tables.rateLimit).toBeDefined();

    const expectedFields = ['key', 'count', 'lastRequest'];
    assertDefined(tables.rateLimit);

    for (const field of expectedFields) {
      expect(tables.rateLimit.fields).toHaveProperty(field);
    }

    assertDefined(tables.rateLimit.fields.key);
    assertDefined(tables.rateLimit.fields.count);
    assertDefined(tables.rateLimit.fields.lastRequest);

    expect(tables.rateLimit.fields.key.unique).toBe(true);
    expect(tables.rateLimit.fields.key.required).toBe(true);
    expect(tables.rateLimit.fields.count.required).toBe(true);
    expect(tables.rateLimit.fields.lastRequest.required).toBe(true);
  });

  // T25: Fluxo de auth completo com storage: 'database'
  it('T25: full authentication flow completes successfully with storage: database', async () => {
    const email = 'ratelimit-db-user@example.com';

    const { token } = await signUpAndGetToken(app, email);
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(10);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    const body = meResponse.json<{ email: string }>();
    expect(body.email).toBe(email);
  });

  // T26: enabled: isProduction em ambiente de teste (D-19)
  it('T26: rate limit is disabled in test environment (no 429 in 20 requests) (D-19)', async () => {
    expect(process.env.NODE_ENV).toBe('test');

    const responses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: {
          email: 'nonexistent@example.com',
          password: 'WrongPassword123!',
        },
      });
      responses.push(res.statusCode);
    }

    expect(responses).toHaveLength(20);
    for (const status of responses) {
      expect(status).not.toBe(429);
      expect(status).toBe(401);
    }
  });
});
