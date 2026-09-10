import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { pool, setPool } from '../../src/db/client.js';
import { session } from '../../src/db/schema/index.js';
import { clearOutbox, outbox } from '../../src/shared/email/mailer.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Auth Client IP (R-01 — T32–T33)', () => {
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

  // T32: Sign-up e Sign-in com remoteAddress='198.51.100.9' e XFF='6.6.6.6' -> session.ip_address é '198.51.100.9', nunca '6.6.6.6'
  it('T32: session.ip_address records request.ip (198.51.100.9) and discards forged x-forwarded-for (6.6.6.6)', async () => {
    const email = 'client-ip-test@example.com';
    const password = 'StrongP@ssw0rd!2026#R01';

    // 1. Sign-up com IP remoto 198.51.100.9 e header forjado 6.6.6.6
    const signUpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      remoteAddress: '198.51.100.9',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '6.6.6.6',
      },
      payload: {
        name: 'IP Test User',
        email,
        password,
      },
    });

    expect(signUpRes.statusCode).toBe(200);

    // 2. Extrai link de confirmação do outbox e verifica e-mail
    const lastEmail = outbox[outbox.length - 1];
    expect(lastEmail).toBeDefined();
    const urlMatch = /href="([^"]+)"/.exec(lastEmail?.html ?? '');
    expect(urlMatch?.[1]).toBeDefined();

    const confirmationUrl = new URL(urlMatch?.[1] ?? '');
    const verifyPathAndQuery = `${confirmationUrl.pathname}${confirmationUrl.search}`;

    const verifyRes = await app.inject({
      method: 'GET',
      url: verifyPathAndQuery,
      remoteAddress: '198.51.100.9',
      headers: { 'x-forwarded-for': '6.6.6.6' },
    });
    expect([200, 302]).toContain(verifyRes.statusCode);

    // 3. Sign-in com remoteAddress 198.51.100.9 e XFF forjado 6.6.6.6
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      remoteAddress: '198.51.100.9',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '6.6.6.6',
      },
      payload: {
        email,
        password,
      },
    });

    expect(signInRes.statusCode).toBe(200);

    // 4. Inspeciona o ip_address persistido na tabela session
    const sessions = await testDb.db.select().from(session);
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    for (const sess of sessions) {
      expect(sess.ipAddress).toBe('198.51.100.9');
      expect(sess.ipAddress).not.toBe('6.6.6.6');
    }
  });

  // T33: getIPFromHeader('10.0.0.5', { trustedProxies: ['10.0.0.0/8'] }) importado da lib instalada retorna null
  it('T33: getIPFromHeader returns null when remote IP falls inside trustedProxies (library baseline check)', async () => {
    const req = createRequire(import.meta.url);
    const ipModulePath = createRequire(req.resolve('better-auth')).resolve(
      '@better-auth/core/utils/ip',
    );
    const { getIPFromHeader } = (await import(ipModulePath)) as {
      getIPFromHeader: (header: string, options?: { trustedProxies?: string[] }) => string | null;
    };

    const result = getIPFromHeader('10.0.0.5', { trustedProxies: ['10.0.0.0/8'] });
    expect(result).toBeNull();
  });
});
