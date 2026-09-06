import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { setPool } from '../../src/db/client.js';
import { user } from '../../src/db/schema/index.js';
import {
  createAuth,
  resetAuthInstanceForTest,
  setAuthInstanceForTest,
} from '../../src/modules/auth/auth.config.js';
import { clearOutbox } from '../../src/shared/email/mailer.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('OAuth Social & Security Integration Tests (T21 - T26)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);

    // Configura o Better Auth com o provedor Google habilitado para testes de integração
    setAuthInstanceForTest(
      createAuth({
        overrideSocialProviders: {
          google: {
            clientId: 'test-google-client-id.apps.googleusercontent.com',
            clientSecret: 'test-google-client-secret',
            scope: ['openid', 'email', 'profile'],
          },
        },
      }),
    );

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    resetAuthInstanceForTest();
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await truncateAll(testDb.db);
    clearOutbox();
  });

  it('T21: POST /api/auth/sign-in/social with provider google returns 200 with redirect URL to accounts.google.com', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: { 'content-type': 'application/json' },
      payload: {
        provider: 'google',
        callbackURL: 'http://localhost:3333',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { url: string; redirect: boolean };
    expect(body.redirect).toBe(true);
    expect(body.url).toContain('accounts.google.com');
  });

  it('T22: POST /api/auth/sign-in/social with unsupported provider returns 4xx and never 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: { 'content-type': 'application/json' },
      payload: {
        provider: 'twitter',
        callbackURL: 'http://localhost:3333',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.statusCode).not.toBe(500);
  });

  it('T23: POST /api/auth/sign-in/social with provider without credentials in env returns 4xx without 500', async () => {
    // Provedor facebook existe nas opções conhecidas do projeto, mas não possui credenciais configuradas
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: { 'content-type': 'application/json' },
      payload: {
        provider: 'facebook',
        callbackURL: 'http://localhost:3333',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.statusCode).not.toBe(500);
  });

  it('T24: GET /api/auth/callback/google with invalid state returns 4xx or 302 redirect to error and inserts no rows in user', async () => {
    const usersBefore = await testDb.db.select().from(user);
    expect(usersBefore).toHaveLength(0);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/callback/google?state=invalid-tampered-state&code=fake-code',
    });

    // Better Auth trata state inválido com redirect para URL de erro (302) ou status de erro cliente 4xx
    expect(res.statusCode === 302 || (res.statusCode >= 400 && res.statusCode < 500)).toBe(true);
    if (res.statusCode === 302) {
      expect(res.headers.location).toContain('error=state_mismatch');
    }

    const usersAfter = await testDb.db.select().from(user);
    expect(usersAfter).toHaveLength(0);
  });

  it('T25: callbackURL to untrusted external origin is rejected by trustedOrigins', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: { 'content-type': 'application/json' },
      payload: {
        provider: 'google',
        callbackURL: 'https://evil.example/steal-token',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('INVALID_CALLBACK_URL');
  });

  it('T26: 10 consecutive requests to /api/auth/forget-password in test environment never return 429', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/auth/forget-password',
          headers: { 'content-type': 'application/json' },
          payload: {
            email: 'unregistered-user@example.com',
          },
        }),
      ),
    );

    for (const response of responses) {
      expect(response.statusCode).not.toBe(429);
      expect(response.statusCode).toBe(200);
    }
  });
});
