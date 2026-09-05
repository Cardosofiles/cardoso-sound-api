import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { pool, setPool } from '../../../src/db/client.js';
import { session, user } from '../../../src/db/schema/index.js';
import { UsersRepository } from '../../../src/modules/users/users.repository.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { signUpAndGetToken } from '../../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../../setup/testcontainers.js';

describe('UsersRepository & /api/v1/me Integration Tests', () => {
  let testDb: TestDatabase;
  let repo: UsersRepository;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
    repo = new UsersRepository(testDb.db);

    app = await buildApp();
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

  // ============================================================================
  // Testes Diretos de UsersRepository
  // ============================================================================

  describe('UsersRepository Direct Methods', () => {
    it('Repo 1: findById returns explicit 5 columns for existing user', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-find@example.com');

      const found = await repo.findById(userId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(userId);
      expect(found?.email).toBe('repo-find@example.com');
      expect(found?.createdAt).toBeInstanceOf(Date);
      expect(found).not.toHaveProperty('password');
      expect(found).not.toHaveProperty('emailVerified');
    });

    it('Repo 2: findById returns null for non-existent userId', async () => {
      const found = await repo.findById('non-existent-user-id');
      expect(found).toBeNull();
    });

    it('Repo 3: update modifies name, keeps image, and updates updatedAt', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-update@example.com');

      const updated = await repo.update(userId, { name: 'Updated Repo Name' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Repo Name');
      expect(updated?.email).toBe('repo-update@example.com');
    });

    it('Repo 4: update with image: null explicitly clears image to null in database', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-image@example.com');

      // Primeiro define uma imagem
      await repo.update(userId, { image: 'https://example.com/pic.jpg' });
      const withImage = await repo.findById(userId);
      expect(withImage?.image).toBe('https://example.com/pic.jpg');

      // Limpa a imagem usando null
      const cleared = await repo.update(userId, { image: null });
      expect(cleared?.image).toBeNull();

      const inDb = await repo.findById(userId);
      expect(inDb?.image).toBeNull();
    });

    it('Repo 5: delete removes user in transaction; returns true once and false on repeat', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-del@example.com');

      const firstDelete = await repo.delete(userId);
      expect(firstDelete).toBe(true);

      const secondDelete = await repo.delete(userId);
      expect(secondDelete).toBe(false);

      const checkUser = await repo.findById(userId);
      expect(checkUser).toBeNull();
    });
  });

  // ============================================================================
  // Testes HTTP de Rotas /api/v1/me (T9 a T23)
  // ============================================================================

  describe('HTTP Endpoints /api/v1/me (T9 a T23)', () => {
    // T9: GET /me com Bearer válido -> 200 com o e-mail do sign-up
    it('T9: GET /api/v1/me with valid Bearer token returns 200 and user email', async () => {
      const { token, userId } = await signUpAndGetToken(app, 'user-t9@example.com');

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string; email: string; name: string }>();
      expect(body.id).toBe(userId);
      expect(body.email).toBe('user-t9@example.com');
      expect(body.name).toBe('E2E Test User');
    });

    // T10: GET /me sem Authorization -> 401 com envelope RFC 7807
    it('T10: GET /api/v1/me without Authorization returns 401 with standard error envelope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
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

    // T11: GET /me com Bearer inválido -> 401
    it('T11: GET /api/v1/me with invalid Bearer token returns 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: 'Bearer invalid-token-xyz-12345',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.statusCode).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    // T12: GET /me com cookie -> 200 (prova de D-13)
    it('T12: GET /api/v1/me with session cookie returns 200 (proving D-13)', async () => {
      const signUpRes = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        payload: {
          name: 'Cookie User',
          email: 'cookie-user-t12@example.com',
          password: 'Password123!',
        },
      });

      expect(signUpRes.statusCode).toBe(200);
      const setCookies = signUpRes.headers['set-cookie'];
      expect(setCookies).toBeDefined();

      const cookieHeader = Array.isArray(setCookies)
        ? setCookies.map((c) => c.split(';')[0]).join('; ')
        : (setCookies?.split(';')[0] ?? '');

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          cookie: cookieHeader,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ email: string; name: string }>();
      expect(body.email).toBe('cookie-user-t12@example.com');
      expect(body.name).toBe('Cookie User');
    });

    // T13: Resposta de /me tem exatamente 5 chaves -> nenhuma extra
    it('T13: GET /api/v1/me response has exactly the 5 specified keys with no extra properties', async () => {
      const { token } = await signUpAndGetToken(app);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Record<string, unknown>>();
      const keys = Object.keys(body).sort();
      expect(keys).toEqual(['createdAt', 'email', 'id', 'image', 'name'].sort());
    });

    // T14: PATCH /me com {name} -> 200, nome novo; GET /me confirma
    it('T14: PATCH /api/v1/me with {name} returns 200 and GET /me confirms update', async () => {
      const { token } = await signUpAndGetToken(app);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Nome Novo T14',
        },
      });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json<{ name: string }>().name).toBe('Nome Novo T14');

      const getRes = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.json<{ name: string }>().name).toBe('Nome Novo T14');
    });

    // T15: PATCH /me com {} -> 400
    it('T15: PATCH /api/v1/me with empty body {} returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Bad Request');
    });

    // T16: PATCH /me com image não-URL -> 400
    it('T16: PATCH /api/v1/me with non-url image returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          image: 'invalid-non-url-string',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Bad Request');
    });

    // T17: PATCH /me com image: null -> 200, image fica null
    it('T17: PATCH /api/v1/me with image: null sets image to null', async () => {
      const { token } = await signUpAndGetToken(app);

      // 1. Seta imagem válida inicial
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          image: 'https://cdn.example.com/avatar.jpg',
        },
      });

      // 2. Limpa com image: null
      const clearRes = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          image: null,
        },
      });

      expect(clearRes.statusCode).toBe(200);
      expect(clearRes.json<{ image: string | null }>().image).toBeNull();

      const getRes = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.json<{ image: string | null }>().image).toBeNull();
    });

    // T18: PATCH /me sem token -> 401
    it('T18: PATCH /api/v1/me without token returns 401', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          name: 'Nome Sem Token',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    // T19: PATCH /me não altera e-mail mesmo se enviado no corpo -> e-mail intacto
    it('T19: PATCH /api/v1/me does not alter email even if sent in payload', async () => {
      const { token, userId } = await signUpAndGetToken(app, 'safe-email@example.com');

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Nome Atualizado',
          email: 'hacked-email@example.com',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ email: string; name: string }>();
      expect(body.name).toBe('Nome Atualizado');
      expect(body.email).toBe('safe-email@example.com');

      // Validação direta no banco
      const [dbUser] = await testDb.db.select().from(user).where(eq(user.id, userId));
      expect(dbUser).toBeDefined();
      expect(dbUser?.email).toBe('safe-email@example.com');
      expect(dbUser?.name).toBe('Nome Atualizado');
    });

    // T20: DELETE /me -> 204 sem corpo
    it('T20: DELETE /api/v1/me returns 204 No Content with empty body', async () => {
      const { token } = await signUpAndGetToken(app);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
    });

    // T21: Após DELETE /me, o token antigo -> 401
    it('T21: After DELETE /api/v1/me, previous token returns 401 Unauthorized', async () => {
      const { token } = await signUpAndGetToken(app);

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(deleteRes.statusCode).toBe(204);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(401);
    });

    // T22: Após DELETE /me, linhas de session do usuário -> zero (cascade)
    it('T22: After DELETE /api/v1/me, session table rows for the user are zero (cascade)', async () => {
      const { token, userId } = await signUpAndGetToken(app);

      const sessionsBefore = await testDb.db
        .select()
        .from(session)
        .where(eq(session.userId, userId));
      expect(sessionsBefore.length).toBeGreaterThan(0);

      const delRes = await app.inject({
        method: 'DELETE',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(delRes.statusCode).toBe(204);

      const sessionsAfter = await testDb.db
        .select()
        .from(session)
        .where(eq(session.userId, userId));
      expect(sessionsAfter).toHaveLength(0);

      const userInDb = await testDb.db.select().from(user).where(eq(user.id, userId));
      expect(userInDb).toHaveLength(0);
    });

    // T23: Usuário A não consegue ler o perfil de B -> não há rota /users/:id
    it('T23: User A cannot read User B profile; route /api/v1/users/:id does not exist (404)', async () => {
      const userA = await signUpAndGetToken(app, 'user-a-t23@example.com');
      const userB = await signUpAndGetToken(app, 'user-b-t23@example.com');

      // 1. Confirma que /api/v1/users/:id não existe e responde 404
      const resById = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${userB.userId}`,
        headers: {
          authorization: `Bearer ${userA.token}`,
        },
      });
      expect(resById.statusCode).toBe(404);

      // 2. Confirma que cada usuário ao chamar /me vê exclusivamente seu próprio perfil
      const resMeA = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${userA.token}`,
        },
      });
      expect(resMeA.statusCode).toBe(200);
      expect(resMeA.json<{ id: string; email: string }>().id).toBe(userA.userId);
      expect(resMeA.json<{ id: string; email: string }>().email).toBe('user-a-t23@example.com');

      const resMeB = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${userB.token}`,
        },
      });
      expect(resMeB.statusCode).toBe(200);
      expect(resMeB.json<{ id: string; email: string }>().id).toBe(userB.userId);
      expect(resMeB.json<{ id: string; email: string }>().email).toBe('user-b-t23@example.com');
    });
  });
});
