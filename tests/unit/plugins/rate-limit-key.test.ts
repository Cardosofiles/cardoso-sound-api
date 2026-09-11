import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../src/config/env.js';
import { pool } from '../../../src/db/client.js';
import {
  buildRateLimitOptions,
  extractSessionToken,
  rateLimitKeyGenerator,
} from '../../../src/plugins/rate-limit.plugin.js';

function createMockRequest(
  url: string,
  ip: string,
  headers: IncomingHttpHeaders = {},
): FastifyRequest {
  return {
    url,
    ip,
    headers,
  } as unknown as FastifyRequest;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'development',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW: '1 minute',
    ...overrides,
  } as unknown as Env;
}

describe('rateLimitKeyGenerator (T1–T6)', () => {
  it('T1: keyGenerator in /api/auth/sign-in/email with bearer returns only the IP', () => {
    const req = createMockRequest('/api/auth/sign-in/email', '192.168.1.1', {
      authorization: 'Bearer secret-bearer-token',
    });

    const key = rateLimitKeyGenerator(req);
    expect(key).toBe('192.168.1.1');
    expect(key).not.toContain('|');
  });

  it('T2: keyGenerator in /api/v1/me without token returns only the IP', () => {
    const req = createMockRequest('/api/v1/me', '10.0.0.1');

    const key = rateLimitKeyGenerator(req);
    expect(key).toBe('10.0.0.1');
    expect(key).not.toContain('|');
  });

  it('T3: keyGenerator in /api/v1/me with bearer returns ip|hash containing the IP', () => {
    const req = createMockRequest('/api/v1/me', '10.0.0.2', {
      authorization: 'Bearer user-session-token-123',
    });

    const key = rateLimitKeyGenerator(req);
    expect(key).toMatch(/^10\.0\.0\.2\|[0-9a-f]{16}$/);
    expect(key.startsWith('10.0.0.2|')).toBe(true);
  });

  it('T4: two different tokens with same IP and same route produce different keys', () => {
    const req1 = createMockRequest('/api/v1/playlists', '10.0.0.3', {
      authorization: 'Bearer token-user-alpha',
    });
    const req2 = createMockRequest('/api/v1/playlists', '10.0.0.3', {
      authorization: 'Bearer token-user-beta',
    });

    const key1 = rateLimitKeyGenerator(req1);
    const key2 = rateLimitKeyGenerator(req2);

    expect(key1).not.toBe(key2);
  });

  it('T5: same token with different IPs produces different keys', () => {
    const req1 = createMockRequest('/api/v1/tracks', '192.168.0.10', {
      authorization: 'Bearer same-shared-token',
    });
    const req2 = createMockRequest('/api/v1/tracks', '192.168.0.20', {
      authorization: 'Bearer same-shared-token',
    });

    const key1 = rateLimitKeyGenerator(req1);
    const key2 = rateLimitKeyGenerator(req2);

    expect(key1).not.toBe(key2);
  });

  it('T6: generated key never contains the raw token in clear text (leak prevention)', () => {
    const rawToken = 'super-confidential-bearer-token-string';
    const req = createMockRequest('/api/v1/favorites', '172.16.0.5', {
      authorization: `Bearer ${rawToken}`,
    });

    const key = rateLimitKeyGenerator(req);
    expect(key).not.toContain(rawToken);
  });
});

describe('extractSessionToken (T7–T11)', () => {
  it('T7: extracts token from Authorization: Bearer <token>', () => {
    const token = extractSessionToken({ authorization: 'Bearer abc' });
    expect(token).toBe('abc');
  });

  it('T8: extracts token from session cookie with and without __Secure- prefix', () => {
    const plainCookieToken = extractSessionToken({
      cookie: 'better-auth.session_token=session_xyz',
    });
    expect(plainCookieToken).toBe('session_xyz');

    const secureCookieToken = extractSessionToken({
      cookie: '__Secure-better-auth.session_token=session_secure_456',
    });
    expect(secureCookieToken).toBe('session_secure_456');

    const multipleCookiesToken = extractSessionToken({
      cookie: 'foo=bar; __Secure-better-auth.session_token=session_in_list; baz=qux',
    });
    expect(multipleCookiesToken).toBe('session_in_list');
  });

  it('T9: returns null when headers object is empty', () => {
    const token = extractSessionToken({});
    expect(token).toBeNull();
  });

  it('T10: returns null when Authorization uses Basic scheme (only Bearer accepted)', () => {
    const token = extractSessionToken({ authorization: 'Basic xyz' });
    expect(token).toBeNull();
  });

  it('T11: extractSessionToken does not query the database (pure memory execution)', () => {
    const querySpy = vi.spyOn(pool, 'query');

    try {
      const token = extractSessionToken({ authorization: 'Bearer token_no_db_check' });
      expect(token).toBe('token_no_db_check');
      expect(querySpy).not.toHaveBeenCalled();
    } finally {
      querySpy.mockRestore();
    }
  });
});

describe('Redis store seam (T21–T22)', () => {
  it('T21: buildRateLimitOptions without RATE_LIMIT_REDIS_URL produces options without redis property', () => {
    const options = buildRateLimitOptions(makeEnv());
    expect(options).not.toHaveProperty('redis');
  });

  it('T22: buildRateLimitOptions with RATE_LIMIT_REDIS_URL throws readable error when ioredis is missing', () => {
    expect(() =>
      buildRateLimitOptions(makeEnv({ RATE_LIMIT_REDIS_URL: 'redis://localhost:6379' })),
    ).toThrowError(
      /RATE_LIMIT_REDIS_URL está definida mas `ioredis` não está instalado\.\s*Rode `pnpm add ioredis` e registre o ADR correspondente \(D-32\)\./,
    );
  });
});
