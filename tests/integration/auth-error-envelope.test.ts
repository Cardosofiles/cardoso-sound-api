import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { clearOutbox } from '../../src/shared/email/mailer.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Auth Error Envelope & Session Hardening (T18–T27)', () => {
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
    vi.restoreAllMocks();
  });

  // T18: POST /sign-in/email com senha errada -> corpo tem code, message, statusCode, error, details
  it('T18: POST /sign-in/email with invalid credentials includes code, message, statusCode, error, details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword123',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<Record<string, unknown>>();

    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('statusCode', 401);
    expect(body).toHaveProperty('error', 'Unauthorized');
    expect(body).toHaveProperty('details', null);
  });

  // T19: O mesmo corpo, chave code -> valor inalterado (INVALID_EMAIL_OR_PASSWORD)
  it('T19: code field in error response preserves original Better Auth code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'invalid@example.com',
        password: 'wrongpassword',
      },
    });

    const body = res.json<Record<string, unknown>>();
    expect(body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(body.message).toBe('Invalid email or password');
  });

  // T20: Sign-in bem-sucedido -> corpo SEM statusCode/error acrescentados
  it('T20: successful sign-in returns original body without statusCode or error injected', async () => {
    const { email } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: 'StrongP@ssw0rd!2026#F5S03',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();

    expect(body).toHaveProperty('user');
    expect(body).toHaveProperty('token');
    expect(body).not.toHaveProperty('statusCode');
    expect(body).not.toHaveProperty('error');
    expect(body).not.toHaveProperty('details');
  });

  // T21: content-length da resposta de erro bate com o corpo recebido (sem truncamento — Armadilha 1)
  it('T21: content-length header matches exact byte length of the transformed error body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'error-len@example.com',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
    const contentLength = res.headers['content-length'];
    expect(contentLength).toBeDefined();

    const expectedByteLength = Buffer.byteLength(res.body);
    expect(Number(contentLength)).toBe(expectedByteLength);
  });

  // T22: Fluxo completo de F3 (sign-up -> verify -> sign-in -> get-session) verde
  it('T22: complete F3 authentication flow succeeds through the enhanced bridge', async () => {
    const { token, email } = await signUpAndGetToken(app);

    const getSessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(getSessionRes.statusCode).toBe(200);
    const sessionBody = getSessionRes.json<{ user: { email: string }; session: { id: string } }>();
    expect(sessionBody.user.email).toBe(email);
    expect(sessionBody.session).toBeDefined();
  });

  // T23: Múltiplos Set-Cookie continuam chegando inteiros (D-44 preservado)
  it('T23: multiple Set-Cookie headers are preserved and forwarded intact', async () => {
    const { email } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password: 'StrongP@ssw0rd!2026#F5S03',
      },
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    // D-44: Better Auth emite cookies de sessão e podem vir como array ou string com session_token
    if (Array.isArray(setCookie)) {
      expect(setCookie.length).toBeGreaterThanOrEqual(1);
      const hasSessionToken = setCookie.some((c) => c.includes('better-auth.session_token'));
      expect(hasSessionToken).toBe(true);
    } else {
      expect(typeof setCookie).toBe('string');
      expect(setCookie).toContain('better-auth.session_token');
    }
  });

  // T24: GET /health com Authorization: Bearer <qualquer> -> zero consultas à tabela session
  it('T24: GET /health with Authorization header results in zero queries to the session table', async () => {
    const querySpy = vi.spyOn(testDb.pool, 'query');
    querySpy.mockClear();

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        authorization: 'Bearer any-forged-or-real-token',
      },
    });

    expect(res.statusCode).toBe(200);

    const sessionQueries = querySpy.mock.calls.filter((args) => {
      const sqlText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string }).text;
      return typeof sqlText === 'string' && sqlText.toLowerCase().includes('session');
    });

    expect(sessionQueries).toHaveLength(0);
  });

  // T25: GET /api/v1/me com bearer válido -> 200, perfil correto
  it('T25: GET /api/v1/me with valid bearer token returns 200 and user profile', async () => {
    const { token, email } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ email: string; name: string }>();
    expect(body.email).toBe(email);
  });

  // T26: GET /api/v1/me com bearer inválido -> 401
  it('T26: GET /api/v1/me with invalid bearer token returns 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: 'Bearer invalid-token-12345' },
    });

    expect(res.statusCode).toBe(401);
  });

  // T27: Duas requisições seguidas a /api/v1/me dentro de 5 min com mesmo cookie -> a 2ª não consulta session (cookieCache)
  it('T27: consecutive requests to /api/v1/me within 5 min with same cookie do not query session on the second request', async () => {
    const { cookie } = await signUpAndGetToken(app);

    // 1ª requisição: preenche o cookieCache
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie },
    });
    expect(res1.statusCode).toBe(200);

    // 2ª requisição imediata: deve usar cookieCache
    const querySpy = vi.spyOn(testDb.pool, 'query');
    querySpy.mockClear();

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie },
    });
    expect(res2.statusCode).toBe(200);

    const sessionQueries = querySpy.mock.calls.filter((args) => {
      const sqlText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string }).text;
      return typeof sqlText === 'string' && sqlText.toLowerCase().includes('session');
    });

    expect(sessionQueries).toHaveLength(0);
  });
});
