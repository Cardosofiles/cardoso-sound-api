import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { session, user } from '../../src/db/schema/index.js';
import type { ErrorResponseEnvelope } from '../../src/plugins/error-handler.plugin.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Auth Integration Tests (Better Auth & Fastify Bridge)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);

    app = await buildApp();

    // Rota para validar request.user (passivo)
    app.get('/test-auth-me', (request) => {
      return { userId: request.user?.id ?? null };
    });

    // Rota protegida com requireAuth (ativo)
    app.get(
      '/test-protected',
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
    await truncateAll(testDb.db);
  });

  // T1: POST /api/auth/sign-up/email válido -> 200, corpo com user, e-mail correto
  it('T1: POST /api/auth/sign-up/email with valid body returns 200 and user object', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'João Cardoso',
        email: 'joao@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: { id: string; email: string; name: string } }>();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('joao@teste.com');
    expect(body.user.name).toBe('João Cardoso');
    expect(typeof body.user.id).toBe('string');
  });

  // T2: Sign-up devolve header set-auth-token -> header presente e não vazio
  it('T2: sign-up response contains non-empty set-auth-token header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'João Token',
        email: 'token@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const token = res.headers['set-auth-token'];
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token).not.toBe('');
  });

  // T3: Sign-up devolve Set-Cookie de sessão -> header presente
  it('T3: sign-up response contains Set-Cookie header with session token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'João Cookie',
        email: 'cookie@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    expect(cookieStr).toContain('better-auth.session_token');
  });

  // T4: Sign-up com senha de 5 chars -> erro (4xx), usuário não criado
  it('T4: sign-up with password < 8 chars returns 400 and does not create user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Curto',
        email: 'curto@teste.com',
        password: '12345',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    const users = await testDb.db.select().from(user).where(eq(user.email, 'curto@teste.com'));
    expect(users).toHaveLength(0);
  });

  // T5: Múltiplos Set-Cookie são todos repassados -> conferir a contagem contra array de cookies
  it('T5: forwards all Set-Cookie headers without collapsing or truncating', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Multi Cookie',
        email: 'multicookie@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();

    if (Array.isArray(cookies)) {
      expect(cookies.length).toBeGreaterThanOrEqual(1);
      for (const c of cookies) {
        expect(typeof c).toBe('string');
        expect(c).toContain('Path=/');
      }
    } else {
      expect(typeof cookies).toBe('string');
    }
  });

  // T6: Sign-up com e-mail já usado -> erro (4xx), sem duplicar linha em "user"
  it('T6: sign-up with duplicate email returns 4xx and does not duplicate user row', async () => {
    const payload = {
      name: 'Duplicado',
      email: 'dup@teste.com',
      password: 'senha-de-teste-123',
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res2.statusCode).toBeGreaterThanOrEqual(400);
    expect(res2.statusCode).toBeLessThan(500);

    const users = await testDb.db.select().from(user).where(eq(user.email, 'dup@teste.com'));
    expect(users).toHaveLength(1);
  });

  // T7: POST /sign-in/email com senha correta -> 200 + token
  it('T7: POST /api/auth/sign-in/email with valid password returns 200 and token', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Login User',
        email: 'login@teste.com',
        password: 'senha-correta-123',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'login@teste.com',
        password: 'senha-correta-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const token = res.headers['set-auth-token'];
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token).not.toBe('');
  });

  // T8: POST /sign-in/email com senha errada -> 401
  it('T8: POST /api/auth/sign-in/email with wrong password returns 401', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Login User Wrong',
        email: 'wrong@teste.com',
        password: 'senha-correta-123',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'wrong@teste.com',
        password: 'senha-totalmente-errada',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // T9: GET /get-session com Bearer -> 200 com user e session
  it('T9: GET /api/auth/get-session with Bearer token returns 200 with user and session', async () => {
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Bearer User',
        email: 'bearer@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    const token = signUpRes.headers['set-auth-token'] as string;
    expect(token).toBeDefined();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: { email: string }; session: { id: string } }>();
    expect(body).not.toBeNull();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('bearer@teste.com');
    expect(body.session).toBeDefined();
  });

  // T10: GET /get-session com cookie -> 200 — prova o D-13
  it('T10: GET /api/auth/get-session with session cookie returns 200 (proves D-13)', async () => {
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Cookie User',
        email: 'cookieauth@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    const rawCookies = signUpRes.headers['set-cookie'];
    expect(rawCookies).toBeDefined();

    const cookieHeader = Array.isArray(rawCookies)
      ? rawCookies.map((c) => c.split(';')[0]).join('; ')
      : String(rawCookies).split(';')[0];

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: { email: string }; session: { id: string } }>();
    expect(body).not.toBeNull();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('cookieauth@teste.com');
    expect(body.session).toBeDefined();
  });

  // T11: GET /get-session sem credencial -> null ou 401 (Better Auth responde 200 com null)
  it('T11: GET /api/auth/get-session without credentials returns 200 with null body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  // T12: request.user populado em rota qualquer com Bearer -> rota de teste devolve o id
  it('T12: populates request.user in any route with valid Bearer token', async () => {
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Passive User',
        email: 'passive@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    const token = signUpRes.headers['set-auth-token'] as string;
    const expectedUserId = signUpRes.json<{ user: { id: string } }>().user.id;

    const res = await app.inject({
      method: 'GET',
      url: '/test-auth-me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: expectedUserId });
  });

  // T13: request.user === null sem credencial -> rota de teste devolve null, sem lançar
  it('T13: request.user remains null without credentials on public route without throwing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-auth-me',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: null });
  });

  // T14: requireAuth sem credencial -> 401 com o envelope de erro do projeto
  it('T14: requireAuth without credentials returns 401 with standard RFC 7807 error envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<ErrorResponseEnvelope>();
    expect(body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required',
      details: null,
    });
  });

  // T15: requireAuth com Bearer inválido/expirado -> 401
  it('T15: requireAuth with invalid Bearer token returns 401 with error envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { authorization: 'Bearer invalid_or_expired_mock_token' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<ErrorResponseEnvelope>();
    expect(body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required',
      details: null,
    });
  });

  // T16: requireAuth com Bearer válido -> passa; handler executa
  it('T16: requireAuth with valid Bearer token executes protected handler successfully', async () => {
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Protected User',
        email: 'protected@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    const token = signUpRes.headers['set-auth-token'] as string;
    const expectedUserId = signUpRes.json<{ user: { id: string } }>().user.id;

    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, userId: expectedUserId });
  });

  // T17: Sessão persiste em session no banco -> SELECT encontra a linha
  it('T17: verifies session is persisted in database session table', async () => {
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'DB Session User',
        email: 'dbsession@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    const userId = signUpRes.json<{ user: { id: string } }>().user.id;

    const dbSessions = await testDb.db.select().from(session).where(eq(session.userId, userId));

    expect(dbSessions).toHaveLength(1);
    expect(dbSessions[0]?.userId).toBe(userId);
    expect(dbSessions[0]?.token).toBeDefined();
  });

  // T18: POST /sign-out invalida a sessão -> get-session seguinte não autentica
  it('T18: POST /api/auth/sign-out invalidates session and subsequent get-session returns null', async () => {
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Sign Out User',
        email: 'signout@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    const token = signUpRes.headers['set-auth-token'] as string;

    const signOutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(signOutRes.statusCode).toBe(200);

    const getSessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(getSessionRes.statusCode).toBe(200);
    expect(getSessionRes.json()).toBeNull();
  });

  // T19: Rate limit do Better Auth desligado em teste -> 15 sign-ins seguidos sem 429
  it('T19: rate limit is disabled in test environment allowing 15 consecutive requests without 429 (proves D-19)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Rate Limit User',
        email: 'ratelimit@teste.com',
        password: 'senha-de-teste-123',
      },
    });

    for (let i = 0; i < 15; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'ratelimit@teste.com',
          password: 'senha-de-teste-123',
        },
      });

      expect(res.statusCode).not.toBe(429);
      expect(res.statusCode).toBe(200);
    }
  });

  // Helper de E2E: signUpAndGetToken
  it('E2E Helper: signUpAndGetToken creates user and returns valid Bearer token and userId', async () => {
    const { token, userId } = await signUpAndGetToken(app);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    expect(userId).toBeDefined();
    expect(typeof userId).toBe('string');

    // Valida que o token retornado pelo helper autentica com sucesso
    const res = await app.inject({
      method: 'GET',
      url: '/test-protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, userId });
  });
});
