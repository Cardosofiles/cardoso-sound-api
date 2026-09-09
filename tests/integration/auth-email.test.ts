import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { session, user } from '../../src/db/schema/index.js';
import { clearOutbox, outbox } from '../../src/shared/email/mailer.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

import { signUpAndGetToken } from '../e2e/helpers/auth.js';

describe('Auth Email Integration Tests (Verification & Password Reset)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
    app = await buildApp();

    app.get(
      '/test-protected-email',
      {
        onRequest: [app.requireAuth],
      },
      (request) => {
        return { ok: true, userId: request.user?.id };
      },
    );

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

  it('T7_orig: sign-up triggers email verification enqueueing 1 email with token in outbox', async () => {
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

  // T5: POST /sign-in/email antes de verificar -> 403 (GAP-14 / D-51 — substitui T8 de F3)
  it('T5: POST /api/auth/sign-in/email before email verification returns 403 (GAP-14 / D-51)', async () => {
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

    expect(signInRes.statusCode).toBe(403);
  });

  // T6: GET /verify-email com token válido -> POST /sign-in/email -> 200 com set-auth-token
  it('T6: GET /verify-email with valid token allows subsequent POST /sign-in/email returning 200 and set-auth-token', async () => {
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
    const rawUrl = (urlMatch?.[1] ?? '').replace(/&amp;/g, '&');
    const token = new URL(rawUrl).searchParams.get('token') ?? '';
    expect(token).toBeTruthy();

    const verifyRes = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?token=${token}`,
    });
    expect(verifyRes.statusCode).toBe(200);

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
    expect(signInRes.headers['set-auth-token']).toBeDefined();
  });

  // T7: Token devolvido no sign-up de usuário não verificado -> null e sem set-auth-token
  it('T7: POST /api/auth/sign-up/email returns token null and no session headers for unverified user (GAP-08 / D-51)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Não Verificado',
        email: 'naoverificado@teste.com',
        password: 'senha-valida-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ token: string | null; user: { emailVerified: boolean } }>();
    expect(body.token).toBeNull();
    expect(body.user.emailVerified).toBe(false);
    expect(res.headers['set-auth-token']).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
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

    // Garante que o e-mail está verificado para permitir sign-in
    await testDb.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, 'reset@teste.com'));

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

    await testDb.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, 'reset@teste.com'));

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

    await testDb.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, 'reset@teste.com'));

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

  // T8: Reset de senha revoga Bearer token anterior (GAP-07 / D-52 — substitui T20 de F3)
  it('T8: password reset revokes previous Bearer token so protected routes return 401 (GAP-07 / D-52)', async () => {
    const { token, email } = await signUpAndGetToken(app, 'session-reset-bearer@teste.com');

    // Valida que o token funciona antes do reset
    const checkBefore = await app.inject({
      method: 'GET',
      url: '/test-protected-email',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(checkBefore.statusCode).toBe(200);

    // Dispara reset de senha
    clearOutbox();
    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);

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

    // Bearer token anterior ao reset é invalidado: get-session retorna null e rota protegida retorna 401
    const getSessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getSessionRes.json()).toBeNull();

    const protectedRes = await app.inject({
      method: 'GET',
      url: '/test-protected-email',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(protectedRes.statusCode).toBe(401);
  });

  // T9: Reset de senha revoga Cookie de sessão anterior (GAP-07 / D-52)
  it('T9: password reset revokes previous session cookie so protected routes return 401 (GAP-07 / D-52)', async () => {
    const { cookie, email } = await signUpAndGetToken(app, 'session-reset-cookie@teste.com');

    // Valida que o cookie funciona antes do reset
    const checkBefore = await app.inject({
      method: 'GET',
      url: '/test-protected-email',
      headers: { cookie },
    });
    expect(checkBefore.statusCode).toBe(200);

    // Dispara reset de senha
    clearOutbox();
    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        redirectTo: 'http://localhost:3333/reset-password',
      },
    });

    const resetToken = extractResetToken(outbox[0]?.html);

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

    // Cookie anterior ao reset é invalidado
    const getSessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    expect(getSessionRes.json()).toBeNull();

    const protectedRes = await app.inject({
      method: 'GET',
      url: '/test-protected-email',
      headers: { cookie },
    });
    expect(protectedRes.statusCode).toBe(401);
  });

  // T10: Reset de senha -> sign-in com a senha nova funciona (200)
  it('T10: POST /api/auth/sign-in/email with new password succeeds after reset (200)', async () => {
    const { email } = await signUpAndGetToken(app, 'session-reset-signin@teste.com');

    clearOutbox();
    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
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

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: 'nova-senha-segura-456',
      },
    });

    expect(signInRes.statusCode).toBe(200);
    expect(signInRes.headers['set-auth-token']).toBeDefined();
  });

  // T11: SELECT count(*) FROM session WHERE user_id = ... após o reset -> somente a sessão nova
  it('T11: verifies only the newly created session exists in database after reset', async () => {
    const { userId, email } = await signUpAndGetToken(app, 'session-reset-count@teste.com');

    clearOutbox();
    await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
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

    // Após o reset, todas as sessões anteriores foram revogadas
    const sessionsAfterReset = await testDb.db
      .select()
      .from(session)
      .where(eq(session.userId, userId));
    expect(sessionsAfterReset).toHaveLength(0);

    // Novo login cria exatamente 1 sessão
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: 'nova-senha-segura-456',
      },
    });

    const sessionsAfterNewLogin = await testDb.db
      .select()
      .from(session)
      .where(eq(session.userId, userId));
    expect(sessionsAfterNewLogin).toHaveLength(1);
  });

  // T13: Nenhum e-mail do outbox tem o token fora do href
  it('T13: asserts no email in outbox contains tokens outside the href attribute', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Carlos Substring',
        email: 'substring@teste.com',
        password: 'senha-valida-123',
      },
    });

    expect(outbox.length).toBeGreaterThanOrEqual(1);
    for (const emailItem of outbox) {
      const urlMatch = /href="([^"]+)"/.exec(emailItem.html);
      expect(urlMatch).not.toBeNull();
      const rawHref = urlMatch?.[1] ?? '';
      const tokenMatch = /token=([^&"'>]+)/.exec(rawHref);
      if (tokenMatch?.[1]) {
        const token = tokenMatch[1];
        // Remove todo o atributo href="..."
        const htmlWithoutHref = emailItem.html.replace(/href="[^"]*"/g, '');
        expect(htmlWithoutHref).not.toContain(token);
        expect(emailItem.subject).not.toContain(token);
      }
    }
  });
});
