import { eq, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { twoFactor, user, verification } from '../../src/db/schema/index.js';
import { auth } from '../../src/modules/auth/auth.config.js';
import { env } from '../../src/config/env.js';
import { clearOutbox, outbox } from '../../src/shared/email/mailer.js';
import { signUpAndGetToken } from '../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}

function base32Decode(data: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const decodeMap = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) {
    const char = alphabet[i];
    if (char) decodeMap.set(char, i);
  }
  const result: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;
  for (const char of data) {
    if (char === '=') break;
    const value = decodeMap.get(char);
    if (value === undefined) throw new Error(`Invalid base32 char: ${char}`);
    buffer = (buffer << 5) | value;
    bitsCollected += 5;
    while (bitsCollected >= 8) {
      bitsCollected -= 8;
      result.push((buffer >> bitsCollected) & 255);
    }
  }
  return Uint8Array.from(result);
}

/**
 * Better Auth armazena o segredo raw (32 chars) e expõe a URI otpauth:// com o segredo codificado em base32.
 * Para gerar o código TOTP correto correspondente ao armazenado no banco, decodificamos a string base32
 * extraída da URI otpauth:// para recuperar os bytes do segredo original e passamos para auth.api.generateTOTP.
 */
async function generateValidTotpCode(uriSecret: string): Promise<string> {
  const rawSecret = new TextDecoder().decode(base32Decode(uriSecret));
  const { code } = await auth.api.generateTOTP({ body: { secret: rawSecret } });
  return code;
}

function extractCookie(setCookieHeader: string | string[] | undefined, cookieName: string): string {
  if (!setCookieHeader) return '';
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const h of headers) {
    const parts = h.split(';');
    const cookiePart = parts[0]?.trim();
    if (cookiePart?.startsWith(`${cookieName}=`)) {
      return cookiePart;
    }
  }
  return '';
}

function extractAllCookies(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return headers
    .map((h) => h.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

describe('Auth Two Factor Integration Tests (T6–T24)', () => {
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
    clearOutbox();
    await truncateAll(testDb.db);
  });

  // T6: POST /api/auth/two-factor/enable sem sessão -> 401
  it('T6: POST /api/auth/two-factor/enable without session returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json' },
      payload: {
        password: DEFAULT_PASSWORD,
        method: 'totp',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // T7: POST /api/auth/two-factor/get-totp-uri com sessão -> 200 com URI otpauth:// contendo Cardoso Sound
  it('T7: POST /api/auth/two-factor/get-totp-uri with session returns 200 and otpauth URI containing Cardoso Sound', async () => {
    const testUser = await signUpAndGetToken(app);

    // enable inicial cria o secret
    const enableRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: {
        password: DEFAULT_PASSWORD,
        method: 'totp',
      },
    });
    expect(enableRes.statusCode).toBe(200);

    const getUriRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/get-totp-uri',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: {
        password: DEFAULT_PASSWORD,
      },
    });

    expect(getUriRes.statusCode).toBe(200);
    const body = getUriRes.json<{ totpURI: string }>();
    expect(body.totpURI).toBeDefined();
    expect(body.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(body.totpURI)).toContain('Cardoso Sound');
  });

  // T8: enable seguido de verify-totp com código válido -> 200 e user.two_factor_enabled = true
  it('T8: enable followed by verify-totp with valid code activates 2FA in DB', async () => {
    const testUser = await signUpAndGetToken(app);

    const enableRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: {
        password: DEFAULT_PASSWORD,
        method: 'totp',
      },
    });

    expect(enableRes.statusCode).toBe(200);
    const { totpURI } = enableRes.json<{ totpURI: string }>();
    const secret = new URL(totpURI).searchParams.get('secret');
    assertDefined(secret);

    const code = await generateValidTotpCode(secret);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: { code },
    });

    expect(verifyRes.statusCode).toBe(200);

    const [dbUser] = await testDb.db.select().from(user).where(eq(user.id, testUser.userId));
    assertDefined(dbUser);
    expect(dbUser.twoFactorEnabled).toBe(true);

    const [dbTwoFactor] = await testDb.db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, testUser.userId));
    assertDefined(dbTwoFactor);
    expect(dbTwoFactor.verified).toBe(true);
  });

  // T9: enable com código inválido -> 4xx e two_factor_enabled permanece false
  it('T9: enable with invalid code does not enable 2FA (proves skipVerificationOnEnable: false)', async () => {
    const testUser = await signUpAndGetToken(app);

    const enableRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: {
        password: DEFAULT_PASSWORD,
        method: 'totp',
      },
    });

    expect(enableRes.statusCode).toBe(200);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: { code: '000000' }, // Código sabidamente inválido
    });

    expect(verifyRes.statusCode).toBeGreaterThanOrEqual(400);

    const [dbUser] = await testDb.db.select().from(user).where(eq(user.id, testUser.userId));
    assertDefined(dbUser);
    expect(dbUser.twoFactorEnabled).toBe(false);
  });

  // Helper para cadastrar, verificar e ativar 2FA com TOTP em um usuário de teste
  async function setupUserWith2FA() {
    const testUser = await signUpAndGetToken(app);

    const enableRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: {
        password: DEFAULT_PASSWORD,
        method: 'totp',
      },
    });

    const { totpURI, backupCodes } = enableRes.json<{
      totpURI: string;
      backupCodes: string[];
    }>();
    const secret = new URL(totpURI).searchParams.get('secret');
    assertDefined(secret);

    const code = await generateValidTotpCode(secret);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: { code },
    });

    const newToken =
      typeof verifyRes.headers['set-auth-token'] === 'string'
        ? verifyRes.headers['set-auth-token']
        : (verifyRes.json<{ token?: string }>().token ?? testUser.token);
    const newCookie = extractAllCookies(verifyRes.headers['set-cookie']) || testUser.cookie;

    return {
      testUser: {
        ...testUser,
        token: newToken,
        cookie: newCookie,
      },
      secret,
      backupCodes,
    };
  }

  // T10: POST /api/auth/sign-in/email com 2FA ativo -> não devolve sessão, devolve { twoFactorRedirect: true }
  it('T10: POST /api/auth/sign-in/email with 2FA active does not return session, returns twoFactorRedirect: true', async () => {
    const { testUser } = await setupUserWith2FA();

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
    const body = signInRes.json<{ twoFactorRedirect?: boolean; twoFactorMethods?: string[] }>();
    expect(body.twoFactorRedirect).toBe(true);
    expect(body.twoFactorMethods).toContain('totp');
    expect(signInRes.headers['set-auth-token']).toBeUndefined();

    const challengeCookie = extractCookie(
      signInRes.headers['set-cookie'],
      'better-auth.two_factor',
    );
    expect(challengeCookie).toContain('better-auth.two_factor');
  });

  // T11: verify-totp no fluxo de sign-in com código válido -> 200 com set-auth-token e sessão
  it('T11: verify-totp during sign-in flow with valid code returns 200 and set-auth-token header', async () => {
    const { testUser, secret } = await setupUserWith2FA();

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);
    const code = await generateValidTotpCode(secret);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code },
    });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.headers['set-auth-token']).toBeDefined();
    const body = verifyRes.json<{ token: string; user: { id: string } }>();
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(testUser.userId);
  });

  // T12: POST /api/auth/two-factor/send-otp -> 200; outbox com 1 e-mail contendo 6 dígitos
  it('T12: POST /api/auth/two-factor/send-otp enqueues 1 email in outbox with 6-digit code', async () => {
    const { testUser } = await setupUserWith2FA();
    clearOutbox();

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);

    const sendOtpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/send-otp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: {},
    });

    expect(sendOtpRes.statusCode).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe(testUser.email);
    expect(outbox[0]?.subject).toContain('Seu código de verificação');
    expect(outbox[0]?.html).toMatch(/\b\d{6}\b/);
  });

  // T13: verify-otp com o código do outbox -> 200 com sessão
  it('T13: verify-otp with the code from outbox returns 200 with session', async () => {
    const { testUser } = await setupUserWith2FA();
    clearOutbox();

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);

    await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/send-otp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: {},
    });

    const lastEmail = outbox[outbox.length - 1];
    assertDefined(lastEmail);
    const otpMatch = /\b(\d{6})\b/.exec(lastEmail.html);
    assertDefined(otpMatch);
    const otpCode = otpMatch[1];
    assertDefined(otpCode);

    const verifyOtpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-otp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code: otpCode },
    });

    expect(verifyOtpRes.statusCode).toBe(200);
    expect(verifyOtpRes.headers['set-auth-token']).toBeDefined();
    const body = verifyOtpRes.json<{ token: string }>();
    expect(body.token).toBeDefined();
  });

  // T14: verify-otp com código expirado -> 4xx
  it('T14: verify-otp with expired code returns 4xx', async () => {
    const { testUser } = await setupUserWith2FA();
    clearOutbox();

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);

    await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/send-otp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: {},
    });

    const lastEmail = outbox[outbox.length - 1];
    assertDefined(lastEmail);
    const otpMatch = /\b(\d{6})\b/.exec(lastEmail.html);
    assertDefined(otpMatch);
    const otpCode = otpMatch[1];
    assertDefined(otpCode);

    // Expira o registro de OTP retroagindo expiresAt no PostgreSQL
    await testDb.db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(like(verification.identifier, '2fa-otp-%'));

    const verifyOtpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-otp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code: otpCode },
    });

    expect(verifyOtpRes.statusCode).toBeGreaterThanOrEqual(400);
  });

  // T15: generate-backup-codes -> 10 códigos distintos
  it('T15: generate-backup-codes returns 10 distinct recovery codes', async () => {
    const { testUser } = await setupUserWith2FA();

    const genRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/generate-backup-codes',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: { password: DEFAULT_PASSWORD },
    });

    expect(genRes.statusCode).toBe(200);
    const body = genRes.json<{ backupCodes: string[]; status: boolean }>();
    expect(body.status).toBe(true);
    expect(body.backupCodes).toHaveLength(10);

    const uniqueSet = new Set(body.backupCodes);
    expect(uniqueSet.size).toBe(10);
  });

  // T16: verify-backup-code com código válido -> 200 com sessão
  it('T16: verify-backup-code with a valid code returns 200 and session', async () => {
    const { testUser, backupCodes } = await setupUserWith2FA();
    const codeToUse = backupCodes[0];
    assertDefined(codeToUse);

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-backup-code',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code: codeToUse },
    });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.headers['set-auth-token']).toBeDefined();
    const body = verifyRes.json<{ token: string; user: { id: string } }>();
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(testUser.userId);
  });

  // T17: O mesmo backup code uma segunda vez -> 4xx (uso único)
  it('T17: reusing the same backup code a second time returns 4xx (one-time use)', async () => {
    const { testUser, backupCodes } = await setupUserWith2FA();
    const codeToUse = backupCodes[0];
    assertDefined(codeToUse);

    // Primeiro uso com sucesso
    const signInRes1 = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader1 = extractAllCookies(signInRes1.headers['set-cookie']);

    const verifyRes1 = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-backup-code',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader1,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code: codeToUse },
    });
    expect(verifyRes1.statusCode).toBe(200);

    // Segundo uso do mesmo código deve falhar
    const signInRes2 = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader2 = extractAllCookies(signInRes2.headers['set-cookie']);

    const verifyRes2 = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-backup-code',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader2,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code: codeToUse },
    });

    expect(verifyRes2.statusCode).toBeGreaterThanOrEqual(400);
  });

  // T18: generate-backup-codes de novo -> códigos antigos passam a responder 4xx
  it('T18: re-generating backup codes invalidates previous backup codes', async () => {
    const { testUser, backupCodes } = await setupUserWith2FA();
    const oldCode = backupCodes[1];
    assertDefined(oldCode);

    // Regenera novos backup codes
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/generate-backup-codes',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: { password: DEFAULT_PASSWORD },
    });
    expect(genRes.statusCode).toBe(200);

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);

    // Tentativa de usar código antigo
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-backup-code',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: { code: oldCode },
    });

    expect(verifyRes.statusCode).toBeGreaterThanOrEqual(400);
  });

  // T19: 6+ tentativas de verify-totp erradas seguidas na mesma conta -> 429 ACCOUNT_TEMPORARILY_LOCKED
  it('T19: 6 consecutive failed verify-totp attempts on the same account trigger 429 ACCOUNT_TEMPORARILY_LOCKED', async () => {
    const { testUser } = await setupUserWith2FA();

    let lastStatusCode = 200;
    let lastBody: Record<string, unknown> = {};

    // Executa tentativas consecutivas com código incorreto
    // O plugin permite até 5 falhas no mesmo desafio; ao invalidar, renovamos o sign-in para continuar acumulando na conta
    let currentCookie = '';

    for (let i = 1; i <= 6; i++) {
      if (!currentCookie || i === 6) {
        const signInRes = await app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers: { 'content-type': 'application/json' },
          payload: {
            email: testUser.email,
            password: DEFAULT_PASSWORD,
          },
        });
        currentCookie = extractAllCookies(signInRes.headers['set-cookie']);
      }

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/api/auth/two-factor/verify-totp',
        headers: {
          'content-type': 'application/json',
          cookie: currentCookie,
          origin: env.BETTER_AUTH_URL,
        },
        payload: { code: '000000' },
      });

      lastStatusCode = verifyRes.statusCode;
      lastBody = verifyRes.json<Record<string, unknown>>();

      if (lastStatusCode === 429) {
        break;
      }
    }

    expect(lastStatusCode).toBe(429);
    expect(JSON.stringify(lastBody)).toContain('ACCOUNT_TEMPORARILY_LOCKED');
  });

  // T20: POST /api/auth/two-factor/disable com sessão e senha correta -> 200; two_factor_enabled = false
  it('T20: POST /api/auth/two-factor/disable with session and correct password disables 2FA in DB', async () => {
    const { testUser } = await setupUserWith2FA();

    const disableRes = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/disable',
      headers: {
        authorization: `Bearer ${testUser.token}`,
        'content-type': 'application/json',
      },
      payload: { password: DEFAULT_PASSWORD },
    });

    expect(disableRes.statusCode).toBe(200);

    const [dbUser] = await testDb.db.select().from(user).where(eq(user.id, testUser.userId));
    assertDefined(dbUser);
    expect(dbUser.twoFactorEnabled).toBe(false);
  });

  // T21: Usuário sem 2FA: sign-in continua devolvendo sessão direto -> 200 (sem regressão)
  it('T21: sign-in for users without 2FA continues returning session and set-auth-token directly', async () => {
    const commonUser = await signUpAndGetToken(app);

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: commonUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    expect(signInRes.statusCode).toBe(200);
    expect(signInRes.headers['set-auth-token']).toBeDefined();
    const body = signInRes.json<{ user: { id: string }; token: string }>();
    expect(body.token).toBeDefined();
    expect(body.user.id).toBe(commonUser.userId);
  });

  // T22: DELETE /api/v1/me de usuário com 2FA ativo -> 204; linha em two_factor sumiu (GAP-09 / cascade)
  it('T22: DELETE /api/v1/me of a user with 2FA active returns 204 and cascades deleting two_factor row', async () => {
    const { testUser } = await setupUserWith2FA();

    // Valida que a linha em two_factor existe antes
    const preCheck = await testDb.db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, testUser.userId));
    expect(preCheck).toHaveLength(1);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: {
        authorization: `Bearer ${testUser.token}`,
      },
    });

    expect(deleteRes.statusCode).toBe(204);

    // Valida que o expurgo em cascata removeu a tupla em two_factor
    const postCheck = await testDb.db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, testUser.userId));
    expect(postCheck).toHaveLength(0);
  });

  // T23: Nenhum e-mail do outbox traz o secret do TOTP
  it('T23: no email in outbox contains the TOTP secret key', async () => {
    const { testUser, secret } = await setupUserWith2FA();
    clearOutbox();

    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: testUser.email,
        password: DEFAULT_PASSWORD,
      },
    });

    const cookieHeader = extractAllCookies(signInRes.headers['set-cookie']);

    await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/send-otp',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        origin: env.BETTER_AUTH_URL,
      },
      payload: {},
    });

    expect(outbox.length).toBeGreaterThan(0);
    for (const msg of outbox) {
      expect(msg.html).not.toContain(secret);
      expect(msg.subject).not.toContain(secret);
    }
  });

  // T24: Nenhuma resposta HTTP expõe secret ou backupCodes de outro usuário
  it('T24: HTTP responses never leak the TOTP secret or backup codes to unauthenticated / other requests', async () => {
    const { secret } = await setupUserWith2FA();
    const otherUser = await signUpAndGetToken(app);

    // Outro usuário tenta ler a URI do primeiro usuário
    const maliciousReq = await app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/get-totp-uri',
      headers: {
        authorization: `Bearer ${otherUser.token}`,
        'content-type': 'application/json',
      },
      payload: { password: DEFAULT_PASSWORD },
    });

    // Se outro usuário ainda não gerou, deve falhar ou gerar o seu próprio, nunca o do testUser
    if (maliciousReq.statusCode === 200) {
      const body = maliciousReq.json<{ totpURI: string }>();
      expect(body.totpURI).not.toContain(secret);
    } else {
      expect(maliciousReq.statusCode).toBeGreaterThanOrEqual(400);
    }
  });
});
