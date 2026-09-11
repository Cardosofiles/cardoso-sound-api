import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { account } from '../../src/db/schema/index.js';
import {
  createAuth,
  resetAuthInstanceForTest,
  setAuthInstanceForTest,
} from '../../src/modules/auth/auth.config.js';
import { clearOutbox } from '../../src/shared/email/mailer.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

interface AccountDto {
  id: string;
  providerId: string;
  accountId: string;
  userId: string;
  issuer: string;
  scopes?: string[];
  createdAt: string;
  updatedAt: string;
}

describe('Account Linking Integration Tests (T5–T18 / D-58)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);

    // Registra google, github e facebook com credenciais dummy para os testes de linking
    setAuthInstanceForTest(
      createAuth({
        overrideSocialProviders: {
          google: {
            clientId: 'test-google-client-id.apps.googleusercontent.com',
            clientSecret: 'test-google-client-secret',
            scope: ['openid', 'email', 'profile'],
          },
          github: {
            clientId: 'test-github-client-id',
            clientSecret: 'test-github-client-secret',
            scope: ['user:email'],
          },
          facebook: {
            clientId: 'test-facebook-client-id',
            clientSecret: 'test-facebook-client-secret',
            scope: ['email', 'public_profile'],
            verifyIdToken: () => Promise.resolve(true),
            getUserInfo: () =>
              Promise.resolve({
                user: {
                  name: 'Facebook User',
                  email: 'facebook.user@example.com',
                  emailVerified: false,
                },
                data: {
                  id: 'facebook-account-id',
                  name: 'Facebook User',
                  email: 'facebook.user@example.com',
                  picture: {
                    data: {
                      height: 100,
                      is_silhouette: false,
                      url: 'https://example.com/avatar.jpg',
                      width: 100,
                    },
                  },
                },
              }),
          },
        },
      }),
    );

    app = await buildApp();
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    resetAuthInstanceForTest();
    await app.close();
    setPool(originalPool);
    await testDb.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(testDb.db);
    clearOutbox();
  });

  // T5: GET /list-accounts sem sessão -> 401
  it('T5: GET /api/auth/list-accounts without session returns 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { statusCode: number; error: string; code?: string };
    expect(body.statusCode).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  // T6: GET /list-accounts após sign-up por e-mail -> 200, array com 1 item, providerId: 'credential'
  it('T6: GET /api/auth/list-accounts after email sign-up returns 200 with 1 credential account', async () => {
    const { token, userId } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const accounts = JSON.parse(res.body) as AccountDto[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.providerId).toBe('credential');
    expect(accounts[0]?.userId).toBe(userId);
  });

  // T7: O corpo de T6 é array cru, não { data, meta }
  it('T7: GET /api/auth/list-accounts returns raw array, not { data, meta } envelope', async () => {
    const { token } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.data).toBeUndefined();
    expect(body.meta).toBeUndefined();
  });

  // T8: GET /list-accounts com bearer do usuário B -> só as contas de B — zero vazamento
  it('T8: GET /api/auth/list-accounts enforces strict user isolation with zero leaks', async () => {
    const userA = await signUpAndGetToken(app, 'user-a@example.com');
    const userB = await signUpAndGetToken(app, 'user-b@example.com');

    // Forja segunda conta vinculada para o usuário B (Google)
    await testDb.db.insert(account).values({
      id: `acc-google-b-${randomUUID()}`,
      accountId: `google-uid-${randomUUID().slice(0, 8)}`,
      providerId: 'google',
      userId: userB.userId,
      issuer: 'https://accounts.google.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resA = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const accountsA = JSON.parse(resA.body) as AccountDto[];
    expect(accountsA).toHaveLength(1);
    expect(accountsA[0]?.userId).toBe(userA.userId);

    const resB = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${userB.token}` },
    });
    const accountsB = JSON.parse(resB.body) as AccountDto[];
    expect(accountsB).toHaveLength(2);
    expect(accountsB.every((a) => a.userId === userB.userId)).toBe(true);
    expect(accountsB.some((a) => a.providerId === 'credential')).toBe(true);
    expect(accountsB.some((a) => a.providerId === 'google')).toBe(true);
  });

  // T9: POST /unlink-account com a única conta -> 400 FAILED_TO_UNLINK_LAST_ACCOUNT
  it('T9: POST /api/auth/unlink-account on single account returns 400 FAILED_TO_UNLINK_LAST_ACCOUNT', async () => {
    const { token } = await signUpAndGetToken(app);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${token}` },
    });
    const accounts = JSON.parse(listRes.body) as AccountDto[];
    const onlyAccount = accounts[0];
    expect(onlyAccount).toBeDefined();

    const unlinkRes = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { accountId: onlyAccount?.id },
    });

    expect(unlinkRes.statusCode).toBe(400);
    const body = JSON.parse(unlinkRes.body) as { code: string; statusCode: number };
    expect(body.code).toBe('FAILED_TO_UNLINK_LAST_ACCOUNT');
    expect(body.statusCode).toBe(400);
  });

  // T10: Com 2 contas, unlink de uma -> 200 { status: true }, R46 passa a devolver 1
  it('T10: POST /api/auth/unlink-account with 2 accounts removes one and returns 200 { status: true }', async () => {
    const { token, userId } = await signUpAndGetToken(app);

    const secondAccountId = `acc-google-${randomUUID()}`;
    await testDb.db.insert(account).values({
      id: secondAccountId,
      accountId: `google-acc-id-${randomUUID().slice(0, 8)}`,
      providerId: 'google',
      userId,
      issuer: 'https://accounts.google.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Confere que possui 2 contas antes
    const listBefore = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(listBefore.body) as AccountDto[]).toHaveLength(2);

    // Desvincula a conta adicional
    const unlinkRes = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { accountId: secondAccountId },
    });

    expect(unlinkRes.statusCode).toBe(200);
    const body = JSON.parse(unlinkRes.body) as { status: boolean };
    expect(body.status).toBe(true);

    // R46 passa a devolver exatamente 1 conta
    const listAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${token}` },
    });
    const accountsAfter = JSON.parse(listAfter.body) as AccountDto[];
    expect(accountsAfter).toHaveLength(1);
    expect(accountsAfter[0]?.providerId).toBe('credential');
  });

  // T11: link-social google com e-mail diferente do da sessão (D-58 a)
  it('T11: allowDifferentEmails allows distinct emails to coexist and be listed in R46 without rejection', async () => {
    const primaryEmail = 'cadastrado@exemplo.com';
    const { token, userId } = await signUpAndGetToken(app, primaryEmail);

    // Insere conta do GitHub associada ao usuário com identidade diferente
    const githubAccountDbId = `acc-github-${randomUUID()}`;
    await testDb.db.insert(account).values({
      id: githubAccountDbId,
      accountId: 'github-user-different-email-98765',
      providerId: 'github',
      userId,
      issuer: 'https://github.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Prova que o estado com e-mails/provedores diferentes é alcançável e exposto por R46
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/auth/list-accounts',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const accounts = JSON.parse(listRes.body) as AccountDto[];
    expect(accounts).toHaveLength(2);
    expect(accounts.some((a) => a.providerId === 'github')).toBe(true);

    // Ao invocar POST /link-social com idToken mock para Google, não devolve LINKING_DIFFERENT_EMAILS_NOT_ALLOWED
    const linkRes = await app.inject({
      method: 'POST',
      url: '/api/auth/link-social',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        provider: 'google',
        idToken: { token: 'mock-id-token' },
      },
    });

    const body = JSON.parse(linkRes.body) as { code?: string };
    expect(body.code).not.toBe('LINKING_DIFFERENT_EMAILS_NOT_ALLOWED');
  });

  // T12: unlink-account com accountId de outro usuário -> 400 ACCOUNT_NOT_FOUND (D-31: indistinguível de inexistente)
  it('T12: POST /api/auth/unlink-account with foreign accountId returns 400 ACCOUNT_NOT_FOUND (IDOR-safe)', async () => {
    const userA = await signUpAndGetToken(app, 'victim-a@example.com');
    const userB = await signUpAndGetToken(app, 'attacker-b@example.com');

    // Cria segunda conta para userA
    const userASecondAccountId = `acc-user-a-extra-${randomUUID()}`;
    await testDb.db.insert(account).values({
      id: userASecondAccountId,
      accountId: `extra-account-id-${randomUUID().slice(0, 8)}`,
      providerId: 'google',
      userId: userA.userId,
      issuer: 'https://accounts.google.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Cria segunda conta para userB para que userB tenha 2 contas
    const userBSecondAccountId = `acc-user-b-extra-${randomUUID()}`;
    await testDb.db.insert(account).values({
      id: userBSecondAccountId,
      accountId: `b-extra-account-id-${randomUUID().slice(0, 8)}`,
      providerId: 'google',
      userId: userB.userId,
      issuer: 'https://accounts.google.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Usuário B tenta desvincular o ID da conta do usuário A
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${userB.token}`,
        'content-type': 'application/json',
      },
      payload: { accountId: userASecondAccountId },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string; statusCode: number };
    expect(body.code).toBe('ACCOUNT_NOT_FOUND');
    expect(body.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(403);

    // Confere que ID de terceiro é indistinguível de ID completamente inexistente
    const resInexistent = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${userB.token}`,
        'content-type': 'application/json',
      },
      payload: { accountId: `totally-random-id-${randomUUID()}` },
    });
    expect(resInexistent.statusCode).toBe(400);
    const bodyInexistent = JSON.parse(resInexistent.body) as { code: string };
    expect(bodyInexistent.code).toBe('ACCOUNT_NOT_FOUND');
  });

  // T13: link-social com provider: 'facebook' -> 401 LINKING_NOT_ALLOWED (D-58 b)
  it('T13: POST /api/auth/link-social with provider facebook returns 401 LINKING_NOT_ALLOWED (D-58 b)', async () => {
    const { token } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/link-social',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        provider: 'facebook',
        idToken: { token: 'dummy-facebook-token' },
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { code: string; statusCode: number };
    expect(body.code).toBe('LINKING_NOT_ALLOWED');
    expect(body.statusCode).toBe(401);
  });

  // T14: unlink-account com sessão de 25h -> 403 SESSION_NOT_FRESH (D-58 c)
  it('T14: POST /api/auth/unlink-account with 25h old session returns 403 SESSION_NOT_FRESH', async () => {
    const { token, userId } = await signUpAndGetToken(app);

    // Insere segunda conta para poder desvincular sem bater no erro de última conta
    const secondAccountId = `acc-to-unlink-${randomUUID()}`;
    await testDb.db.insert(account).values({
      id: secondAccountId,
      accountId: `extra-id-${randomUUID().slice(0, 8)}`,
      providerId: 'google',
      userId,
      issuer: 'https://accounts.google.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Envelhece a sessão no banco para 25 horas atrás
    await testDb.pool.query(
      "UPDATE session SET created_at = now() - interval '25 hours' WHERE user_id = $1",
      [userId],
    );

    // Invoca com Authorization: Bearer para forçar leitura autoral no banco sem cookieCache
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { accountId: secondAccountId },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { code: string; statusCode: number };
    expect(body.code).toBe('SESSION_NOT_FRESH');
    expect(body.statusCode).toBe(403);
  });

  // T15: Após T14, novo sign-in e repetir o unlink -> 200 (step-up funcional)
  it('T15: Reauthenticating via sign-in resolves step-up and allows unlinking (returns 200)', async () => {
    const userEmail = `stepup-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'StrongP@ssw0rd!2026#F5S03';

    const { token, userId } = await signUpAndGetToken(app, userEmail);

    const secondAccountId = `acc-stepup-${randomUUID()}`;
    await testDb.db.insert(account).values({
      id: secondAccountId,
      accountId: `extra-id-${randomUUID().slice(0, 8)}`,
      providerId: 'google',
      userId,
      issuer: 'https://accounts.google.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 1. Envelhece a sessão e recebe 403
    await testDb.pool.query(
      "UPDATE session SET created_at = now() - interval '25 hours' WHERE user_id = $1",
      [userId],
    );

    const staleRes = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { accountId: secondAccountId },
    });
    expect(staleRes.statusCode).toBe(403);

    // 2. Step-up: o app solicita a senha e faz novo sign-in por e-mail
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: userEmail, password },
    });
    expect(signInRes.statusCode).toBe(200);
    const newToken = signInRes.headers['set-auth-token'] as string;
    expect(newToken).toBeDefined();

    // 3. Repete o unlink com a sessão fresca recém-emitida -> 200 OK
    const freshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/unlink-account',
      headers: {
        authorization: `Bearer ${newToken}`,
        'content-type': 'application/json',
      },
      payload: { accountId: secondAccountId },
    });

    expect(freshRes.statusCode).toBe(200);
    const body = JSON.parse(freshRes.body) as { status: boolean };
    expect(body.status).toBe(true);
  });

  // T16: link-social { provider: 'github', idToken: {...} } -> 404 ID_TOKEN_NOT_SUPPORTED
  it('T16: POST /api/auth/link-social for github with idToken returns 404 ID_TOKEN_NOT_SUPPORTED', async () => {
    const { token } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/link-social',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        provider: 'github',
        idToken: { token: 'mock-github-token' },
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as { code: string; statusCode: number };
    expect(body.code).toBe('ID_TOKEN_NOT_SUPPORTED');
    expect(body.statusCode).toBe(404);
  });

  // T17: link-social { provider: 'google', callbackURL } sem idToken -> 200, redirect: true, url contém accounts.google.com
  it('T17: POST /api/auth/link-social for google with callbackURL returns 200 with redirect to accounts.google.com', async () => {
    const { token } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/link-social',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
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

  // T18: link-social com provedor não registrado (twitter) -> 4xx, nunca 500
  it('T18: POST /api/auth/link-social with unregistered provider returns 4xx and never 500', async () => {
    const { token } = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/link-social',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        provider: 'twitter',
        callbackURL: 'http://localhost:3333',
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.statusCode).not.toBe(500);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('PROVIDER_NOT_FOUND');
  });
});
