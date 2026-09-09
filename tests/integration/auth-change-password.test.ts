import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { clearOutbox } from '../../src/shared/email/mailer.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Auth /change-password Integration Tests (GAP-24)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const originalPool = pool;
  const ORIGINAL_PASSWORD = 'StrongP@ssw0rd!2026#F5S03';
  const NEW_PASSWORD = 'NovaSenhaSegura!2026#Alterada';

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
    app = await buildApp();

    // Rota protegida para validar autorização de sessão ativa
    app.get(
      '/test-protected-change-pw',
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

  // T14: POST /api/auth/change-password sem autenticação -> 401
  it('T14: POST /api/auth/change-password without authentication returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { 'content-type': 'application/json' },
      payload: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // T15: Com senha atual incorreta -> 4xx; senha inalterada
  it('T15: POST /api/auth/change-password with wrong current password returns 4xx and keeps password unchanged', async () => {
    const { token, email } = await signUpAndGetToken(app, 'change-pw-t15@teste.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: {
        currentPassword: 'SenhaCompletamenteErrada!123',
        newPassword: NEW_PASSWORD,
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    // Senha original continua válida para login
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: ORIGINAL_PASSWORD,
      },
    });

    expect(signInRes.statusCode).toBe(200);
  });

  // T16: Com senha atual correta -> 200; sign-in com a nova funciona
  it('T16: POST /api/auth/change-password with valid current password returns 200 and allows sign-in with new password', async () => {
    const { token, email } = await signUpAndGetToken(app, 'change-pw-t16@teste.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(200);

    // Sign-in com a nova senha funciona
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: NEW_PASSWORD,
      },
    });

    expect(signInRes.statusCode).toBe(200);
  });

  // T17: Sign-in com a senha antiga depois da troca -> 401
  it('T17: sign-in with old password after successful password change returns 401', async () => {
    const { token, email } = await signUpAndGetToken(app, 'change-pw-t17@teste.com');

    const changeRes = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
      },
    });
    expect(changeRes.statusCode).toBe(200);

    // Sign-in com a senha antiga falha com 401
    const oldSignInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: ORIGINAL_PASSWORD,
      },
    });

    expect(oldSignInRes.statusCode).toBe(401);
  });

  // T18: Com revokeOtherSessions: true no corpo -> segundo bearer da mesma conta passa a responder 401
  it('T18: POST /api/auth/change-password with revokeOtherSessions: true invalidates other sessions', async () => {
    const { token: session1Token, email } = await signUpAndGetToken(app, 'change-pw-t18@teste.com');

    // Cria uma segunda sessão para o mesmo usuário
    const secondSignInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: ORIGINAL_PASSWORD,
      },
    });
    expect(secondSignInRes.statusCode).toBe(200);
    const session2Token = secondSignInRes.headers['set-auth-token'] as string;
    expect(session2Token).toBeDefined();

    // Valida que ambas as sessões autenticam antes da revogação
    const check1Before = await app.inject({
      method: 'GET',
      url: '/test-protected-change-pw',
      headers: { authorization: `Bearer ${session1Token}` },
    });
    expect(check1Before.statusCode).toBe(200);

    const check2Before = await app.inject({
      method: 'GET',
      url: '/test-protected-change-pw',
      headers: { authorization: `Bearer ${session2Token}` },
    });
    expect(check2Before.statusCode).toBe(200);

    // Altera senha usando session1 com revokeOtherSessions: true
    const changeRes = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session1Token}`,
      },
      payload: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      },
    });
    expect(changeRes.statusCode).toBe(200);

    // O segundo Bearer token agora é rejeitado com 401 na rota protegida
    const check2After = await app.inject({
      method: 'GET',
      url: '/test-protected-change-pw',
      headers: { authorization: `Bearer ${session2Token}` },
    });
    expect(check2After.statusCode).toBe(401);
  });

  // T19: Com senha nova de 5 caracteres (< 8) -> 4xx; senha inalterada
  it('T19: POST /api/auth/change-password with newPassword < 8 chars returns 4xx and leaves password unchanged', async () => {
    const { token, email } = await signUpAndGetToken(app, 'change-pw-t19@teste.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: '12345',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    // Senha original permanece inalterada
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: ORIGINAL_PASSWORD,
      },
    });

    expect(signInRes.statusCode).toBe(200);
  });
});
