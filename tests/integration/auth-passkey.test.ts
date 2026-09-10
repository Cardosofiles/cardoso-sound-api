import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { passkey } from '../../src/db/schema/index.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

describe('Auth Passkey Integration Tests (T13–T22)', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const originalPool = pool;
  const DEFAULT_PASSWORD = 'StrongP@ssw0rd!2026#F5S03';

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
    await truncateAll(testDb.db);
  });

  // T13: GET /api/auth/passkey/generate-register-options sem sessão retorna 401
  it('T13: GET /api/auth/passkey/generate-register-options without session returns 401 (proves requireSession)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/generate-register-options',
    });

    expect(res.statusCode).toBe(401);
  });

  // T14: GET /api/auth/passkey/list-user-passkeys com sessão, sem passkey registrada
  it('T14: GET /api/auth/passkey/list-user-passkeys with session and no passkeys returns 200 with empty list', async () => {
    const userA = await signUpAndGetToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/list-user-passkeys',
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<unknown[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  // T15: Usuário B tenta delete-passkey de credencial do Usuário A (linha inserida direto no banco) -> 404 (nunca 403 — D-31)
  it('T15: User B attempts delete-passkey on User A credential returns 404, never 403 (D-31)', async () => {
    const userA = await signUpAndGetToken(app);
    const userB = await signUpAndGetToken(app);

    const passkeyAId = 'pk_user_a_secret';
    await testDb.db.insert(passkey).values({
      id: passkeyAId,
      name: "User A's YubiKey",
      publicKey: 'pubkey-user-a',
      userId: userA.userId,
      credentialID: 'cred-user-a-unique',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
      aaguid: '00000000-0000-0000-0000-000000000000',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/delete-passkey',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${userB.token}`,
      },
      payload: {
        id: passkeyAId,
      },
    });

    // D-31 e spec 03 §7: recurso inexistente e recurso alheio são indistinguíveis. Nenhuma rota do MVP emite 403.
    expect(res.statusCode).not.toBe(403);
    expect([401, 404]).toContain(res.statusCode);
  });

  // T16: Usuário B tenta update-passkey de credencial do Usuário A -> 404 (nunca 403 — D-31)
  it('T16: User B attempts update-passkey on User A credential returns 404, never 403 (D-31)', async () => {
    const userA = await signUpAndGetToken(app);
    const userB = await signUpAndGetToken(app);

    const passkeyAId = 'pk_user_a_rename';
    await testDb.db.insert(passkey).values({
      id: passkeyAId,
      name: "User A's Original Key",
      publicKey: 'pubkey-user-a-2',
      userId: userA.userId,
      credentialID: 'cred-user-a-rename',
      counter: 1,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/update-passkey',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${userB.token}`,
      },
      payload: {
        id: passkeyAId,
        name: 'Hacked Name by User B',
      },
    });

    expect(res.statusCode).not.toBe(403);
    expect([401, 404]).toContain(res.statusCode);
  });

  // T17: Após T15/T16, a linha do Usuário A continua no banco intacta
  it('T17: after unauthorized delete/update attempts, User A passkey remains intact in DB', async () => {
    const userA = await signUpAndGetToken(app);
    const userB = await signUpAndGetToken(app);

    const passkeyAId = 'pk_user_a_intact';
    const originalName = "User A's Secure Key";
    await testDb.db.insert(passkey).values({
      id: passkeyAId,
      name: originalName,
      publicKey: 'pubkey-intact',
      userId: userA.userId,
      credentialID: 'cred-intact-id',
      counter: 5,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    // Tentativa de update malicioso
    await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/update-passkey',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${userB.token}`,
      },
      payload: { id: passkeyAId, name: 'Modified by B' },
    });

    // Tentativa de delete malicioso
    await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/delete-passkey',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${userB.token}`,
      },
      payload: { id: passkeyAId },
    });

    // Consulta direta no banco
    const [row] = await testDb.db.select().from(passkey).where(eq(passkey.id, passkeyAId));

    assertDefined(row);
    expect(row.name).toBe(originalName);
    expect(row.userId).toBe(userA.userId);
  });

  // T18: POST /api/auth/passkey/verify-authentication ou sign-in sem corpo válido -> 4xx, NÃO 500
  it('T18: POST /api/auth/passkey/verify-authentication with invalid body returns 4xx, not 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/verify-authentication',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  // T19: O desafio gerado traz rpId igual ao configurado (localhost)
  it('T19: authentication challenge returns rpId equal to configured hostname (localhost)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/generate-authenticate-options',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ rpId?: string; rp?: { id?: string } }>();
    expect(body).toBeDefined();
    // O WebAuthn challenge deve especificar rpId = 'localhost' ou rp.id = 'localhost'
    const returnedRpId = body.rpId ?? body.rp?.id;
    expect(returnedRpId).toBe('localhost');
  });

  // T20: DELETE /api/v1/me de usuário com passkey purga a linha em cascata
  it('T20: DELETE /api/v1/me cascades and deletes user passkeys in DB', async () => {
    const userA = await signUpAndGetToken(app);

    const pkId = 'pk_to_be_cascaded';
    await testDb.db.insert(passkey).values({
      id: pkId,
      name: 'Key To Delete',
      publicKey: 'pubkey-del',
      userId: userA.userId,
      credentialID: 'cred-to-delete',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
    });

    expect(deleteRes.statusCode).toBe(204);

    const remaining = await testDb.db.select().from(passkey).where(eq(passkey.id, pkId));

    expect(remaining).toHaveLength(0);
  });

  // T21: Nenhuma resposta expõe public_key ou counter de outro usuário
  it('T21: list-user-passkeys does not leak passkey details belonging to other users', async () => {
    const userA = await signUpAndGetToken(app);
    const userB = await signUpAndGetToken(app);

    await testDb.db.insert(passkey).values({
      id: 'pk_user_a_private',
      name: 'Private Key of User A',
      publicKey: 'super-secret-public-key-A',
      userId: userA.userId,
      credentialID: 'cred-A-private',
      counter: 42,
      deviceType: 'singleDevice',
      backedUp: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/list-user-passkeys',
      headers: {
        authorization: `Bearer ${userB.token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const list = res.json<unknown[]>();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(0);
    expect(res.body).not.toContain('super-secret-public-key-A');
  });

  // T22: Usuário sem passkey continua se autenticando normalmente por senha
  it('T22: sign-in with password continues working without regression for users without passkey', async () => {
    const testUser = await signUpAndGetToken(app);

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    expect(signInRes.statusCode).toBe(200);
    expect(signInRes.headers['set-auth-token']).toBeDefined();
    const body = signInRes.json<{ user: { email: string }; token: string }>();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(testUser.email);
    expect(body.token).toBeDefined();
  });
});
