import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../../src/db/client.js';
import { seed } from '../../../src/db/seed/seed.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { truncateAll } from '../../setup/testcontainers.js';
import { buildTestApp } from '../helpers/app.js';
import { signUpAndGetToken } from '../helpers/auth.js';

describe('E2E Auth Flow (Identity, Bearer Token & Cookie Sessions)', () => {
  let app: FastifyInstance;
  let db: Database;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const context = await buildTestApp();
    app = context.app;
    db = context.db;
    stop = context.stop;
  }, 120_000);

  afterAll(async () => {
    await stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(db);
    await seed(db);
  });

  // E1: sign-up -> GET /me com Bearer -> 200 com o e-mail correto
  it('E1: sign-up -> GET /api/v1/me com Bearer token -> 200 com perfil e e-mail correto', async () => {
    const userEmail = `user-${randomUUID()}@teste.local`;

    const { token } = await signUpAndGetToken(app, userEmail);
    expect(token).toBeTruthy();

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json<{
      id: string;
      name: string;
      email: string;
      image: string | null;
      createdAt: string;
    }>();

    expect(meBody.email).toBe(userEmail);
    expect(meBody.name).toBe('E2E Test User');
    expect(meBody.id).toBeTruthy();
    expect(meBody.createdAt).toBeTruthy();
    expect(Object.keys(meBody).sort()).toEqual(['createdAt', 'email', 'id', 'image', 'name']);
  });

  // E2: sign-in com senha errada -> 401
  it('E2: sign-in com senha errada -> 401 Unauthorized', async () => {
    const userEmail = `user-${randomUUID()}@teste.local`;
    const correctPassword = 'Password123!';

    // Cadastra usuário
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Bob E2E',
        email: userEmail,
        password: correctPassword,
      },
    });
    expect(signUpRes.statusCode).toBe(200);

    // Tenta sign-in com senha incorreta
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: userEmail,
        password: 'WrongPassword999!',
      },
    });

    expect(signInRes.statusCode).toBe(401);
  });

  // E7: rota protegida sem Authorization -> 401 com o envelope correto
  it('E7: rota protegida sem Authorization nem cookie -> 401 com envelope RFC 7807 canônico', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<ErrorResponseEnvelope>();
    expect(body.statusCode).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(typeof body.message).toBe('string');
    expect(body.details).toBeNull();
  });

  // E9: sessão por cookie (sem Bearer) autentica GET /me
  it('E9: sessão por cookie (sem Bearer) autentica GET /api/v1/me com status 200', async () => {
    const userEmail = `user-${randomUUID()}@teste.local`;

    const { cookie, email } = await signUpAndGetToken(app, userEmail);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('better-auth.session_token');

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: {
        cookie,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json<{
      id: string;
      name: string;
      email: string;
      image: string | null;
      createdAt: string;
    }>();

    expect(meBody.email).toBe(email);
    expect(meBody.name).toBe('E2E Test User');
    expect(meBody.id).toBeTruthy();
  });
});
