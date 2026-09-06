import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { session, user } from '../../src/db/schema/index.js';
import { clearOutbox, outbox } from '../../src/shared/email/mailer.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Auth Email Integration Tests (Verification & Password Reset)', () => {
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

  it('T7: sign-up triggers email verification enqueueing 1 email with token in outbox', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe('carlos@teste.com');
    expect(outbox[0]?.subject).toContain('Verifique seu e-mail');
    expect(outbox[0]?.html).toContain('token=');
  });

  it('T8: sign-in succeeds without verifying email (requireEmailVerification: false)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    expect(signInRes.statusCode).toBe(200);
    const body = signInRes.json<{ user: { emailVerified: boolean } }>();
    expect(body.user.emailVerified).toBe(false);
  });

  it('T9: GET /api/auth/verify-email with valid token sets user.emailVerified to true in database', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    const emailHtml = outbox[0]?.html ?? '';
    const urlMatch = /href="([^"]+)"/.exec(emailHtml);
    expect(urlMatch).not.toBeNull();
    const token = new URL(urlMatch?.[1] ?? '').searchParams.get('token') ?? '';
    expect(token).toBeTruthy();

    const verifyRes = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${token}`,
    });

    expect(verifyRes.statusCode).toBe(200);

    const [dbUser] = await testDb.db.select().from(user).where(eq(user.email, 'carlos@teste.com'));
    expect(dbUser?.emailVerified).toBe(true);
  });

  it('T10: using the same verification token a second time returns 200 with null user or 4xx', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    const emailHtml = outbox[0]?.html ?? '';
    const urlMatch = /href="([^"]+)"/.exec(emailHtml);
    const token = new URL(urlMatch?.[1] ?? '').searchParams.get('token') ?? '';

    // First verification
    const firstRes = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${token}`,
    });
    expect(firstRes.statusCode).toBe(200);

    // Second verification with the exact same token
    const secondRes = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${token}`,
    });

    // In Better Auth v1.7.2, an already-verified user either receives 200 with user: null or a 4xx error
    if (secondRes.statusCode === 200) {
      const body = secondRes.json<{ user: unknown }>();
      expect(body.user).toBeNull();
    } else {
      expect(secondRes.statusCode).toBeGreaterThanOrEqual(400);
      expect(secondRes.statusCode).toBeLessThan(500);
    }
  });

  it('T11: GET /api/auth/verify-email with invalid token returns 4xx and user remains unverified', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/auth/verify-email?token=token-invalido-inexistente',
    });

    expect(verifyRes.statusCode).toBeGreaterThanOrEqual(400);
    expect(verifyRes.statusCode).toBeLessThan(500);

    const [dbUser] = await testDb.db.select().from(user).where(eq(user.email, 'carlos@teste.com'));
    expect(dbUser?.emailVerified).toBe(false);
  });

  it('T12: POST /api/auth/send-verification-email with existing email returns 200 and sends email', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha-valida-123',
      },
    });

    clearOutbox();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/send-verification-email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'carlos@teste.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe('carlos@teste.com');
  });

  it('T13: POST /api/auth/send-verification-email with non-existent email returns 200 and empty outbox', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/send-verification-email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'inexistente@teste.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(outbox).toHaveLength(0);
  });

  function extractResetToken(html?: string): string {
    if (!html) {
      throw new Error('Failed to extract reset token: html is undefined');
    }
    const match = /\/reset-password\/([^?"]+)/.exec(html);
    if (!match?.[1]) {
      throw new Error(`Failed to extract reset token from html: ${html}`);
    }
    return match[1];
  }

  it('T14: POST /api/auth/forget-password with existing email returns 200 and sends reset link', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Reset',
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    clearOutbox();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe('reset@teste.com');
    expect(outbox[0]?.subject).toContain('Redefinição de senha');
    expect(outbox[0]?.html).toContain('/reset-password/');
  });

  it('T15: POST /api/auth/forget-password with non-existent email returns 200 identical to T14 and outbox empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'nao-existe@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(outbox).toHaveLength(0);
  });

  it('T16: POST /api/auth/reset-password with valid token updates password and allows sign-in with new password', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Reset',
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    clearOutbox();

    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);
    expect(resetToken).toBeTruthy();

    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: resetToken,
        newPassword: 'nova-senha-segura-456',
      },
    });

    expect(resetRes.statusCode).toBe(200);

    // Sign in with new password succeeds
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        password: 'nova-senha-segura-456',
      },
    });

    expect(signInRes.statusCode).toBe(200);
  });

  it('T17: sign-in with old password after password reset returns 401', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Reset',
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    clearOutbox();

    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);

    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: resetToken,
        newPassword: 'nova-senha-segura-456',
      },
    });

    // Old password must fail with 401
    const oldSignInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    expect(oldSignInRes.statusCode).toBe(401);
  });

  it('T18: reused reset password token returns 4xx', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Reset',
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    clearOutbox();

    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);

    // First use consumes token
    const firstReset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: resetToken,
        newPassword: 'nova-senha-segura-456',
      },
    });
    expect(firstReset.statusCode).toBe(200);

    // Second use of the same token
    const secondReset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: resetToken,
        newPassword: 'terceira-senha-789',
      },
    });

    expect(secondReset.statusCode).toBeGreaterThanOrEqual(400);
    expect(secondReset.statusCode).toBeLessThan(500);
  });

  it('T19: reset-password with password < 8 chars returns 4xx and old password remains valid', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Reset',
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    clearOutbox();

    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);

    // Attempt reset with short password (5 characters)
    const shortReset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: resetToken,
        newPassword: '12345',
      },
    });

    expect(shortReset.statusCode).toBeGreaterThanOrEqual(400);
    expect(shortReset.statusCode).toBeLessThan(500);

    // Old password continues valid
    const oldSignInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset@teste.com',
        password: 'senha-antiga-123',
      },
    });

    expect(oldSignInRes.statusCode).toBe(200);
  });

  it('T20: documents and asserts previous active sessions behavior after password reset', async () => {
    // 1. Cria usuário
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Session',
        email: 'session@teste.com',
        password: 'senha-antiga-123',
      },
    });
    const token = signUpRes.headers['set-auth-token'];
    expect(token).toBeDefined();

    // 2. Dispara reset de senha
    clearOutbox();
    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'session@teste.com',
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);

    // 3. Executa reset de senha
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        token: resetToken,
        newPassword: 'nova-senha-segura-456',
      },
    });
    expect(resetRes.statusCode).toBe(200);

    // 4. Inspeciona se a sessão anterior persiste na base PostgreSQL
    // No Better Auth v1.7.2 padrão (sem revokeSessionsOnPasswordReset: true), sessões ativas são preservadas
    const dbSessions = await testDb.db.select().from(session);
    expect(dbSessions.length).toBeGreaterThanOrEqual(1);

    // Sessão anterior continua válida na resolução de get-session
    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: {
        authorization: `Bearer ${String(token)}`,
      },
    });
    expect(sessionRes.statusCode).toBe(200);
  });
});
