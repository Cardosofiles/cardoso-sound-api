import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { AUTH_RATE_LIMIT_RULES } from '../../src/modules/auth/auth.config.js';
import { clearOutbox, outbox } from '../../src/shared/email/mailer.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Auth Rate Limit & Security Integration Tests', () => {
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

  it('T27: AUTH_RATE_LIMIT_RULES contains exactly the 8 specified endpoint keys', () => {
    const expectedKeys = [
      '/forget-password',
      '/request-password-reset',
      '/send-verification-email',
      '/reset-password',
      '/sign-in/email',
      '/sign-up/email',
      '/change-password',
      '/sign-in/social',
    ].sort();

    const actualKeys = Object.keys(AUTH_RATE_LIMIT_RULES).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it('T28: /forget-password and /request-password-reset have identical rate limit rules (GAP-05)', () => {
    expect(AUTH_RATE_LIMIT_RULES['/forget-password']).toEqual(
      AUTH_RATE_LIMIT_RULES['/request-password-reset'],
    );
  });

  it('T29: all rule paths start with slash and are relative to basePath (no /api/auth)', () => {
    for (const key of Object.keys(AUTH_RATE_LIMIT_RULES)) {
      expect(key.startsWith('/')).toBe(true);
      expect(key).not.toContain('/api/auth');
    }
  });

  it('T30: 20 consecutive sign-in attempts in test environment produce no 429 status (D-19)', async () => {
    const responses = [];

    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'nonexistent@example.com',
          password: 'wrong-password-test',
        },
      });
      responses.push(res.statusCode);
    }

    expect(responses).toHaveLength(20);
    for (const status of responses) {
      expect(status).not.toBe(429);
    }
  });

  it('T31: sign-up -> verify-email -> sign-in flow succeeds without regression', async () => {
    const email = 'user-flow@example.com';
    const password = 'Password123!';

    // 1. Sign-up
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Flow User',
        email,
        password,
      },
    });
    expect(signUpRes.statusCode).toBe(200);

    // 2. Extract verification token from outbox
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    const verificationMail = outbox.find((mail) => mail.to === email);
    expect(verificationMail).toBeDefined();

    const emailHtml = verificationMail?.html ?? '';
    const urlMatch = /href="([^"]+)"/.exec(emailHtml);
    expect(urlMatch).not.toBeNull();
    const token = new URL(urlMatch?.[1] ?? '').searchParams.get('token') ?? '';
    expect(token).toBeTruthy();

    // 3. Verify email
    const verifyRes = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${token}`,
    });
    expect([200, 302]).toContain(verifyRes.statusCode);

    // 4. Sign-in
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password,
      },
    });
    expect(signInRes.statusCode).toBe(200);
    const signInBody = JSON.parse(signInRes.body) as { token?: string };
    expect(signInBody.token).toBeDefined();
  });

  it('T32: GET /api/auth/get-session succeeds with 200 when presented with valid bearer token', async () => {
    const email = 'bearer-test@example.com';
    const password = 'Password123!';

    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Bearer Tester',
        email,
        password,
      },
    });
    expect(signUpRes.statusCode).toBe(200);
    const signUpBody = JSON.parse(signUpRes.body) as { token?: string };
    const token = signUpBody.token;
    expect(token).toBeDefined();
    if (!token) throw new Error('Bearer session token is missing');

    const sessionRes = await app.inject({
      method: 'GET',
      url: `/api/auth/get-session`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(sessionRes.statusCode).toBe(200);
    const sessionBody = JSON.parse(sessionRes.body) as {
      user?: { email: string };
      session?: { id: string };
    };
    expect(sessionBody.user?.email).toBe(email);
    expect(sessionBody.session?.id).toBeDefined();
  });
});
