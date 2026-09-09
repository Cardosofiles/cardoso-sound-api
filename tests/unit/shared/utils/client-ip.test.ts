import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../../src/config/env.js';
import {
  buildTrustProxy,
  isTrustedProxy,
  resolveClientIp,
} from '../../../../src/shared/utils/client-ip.js';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TRUST_PROXY_HOPS: 0,
    TRUSTED_PROXIES: '',
    TRUSTED_PROXY_LIST: [],
    ...overrides,
  } as unknown as Env;
}

describe('resolveClientIp', () => {
  it('T12: returns socketIp when trustedProxies is empty even if XFF is present', () => {
    const result = resolveClientIp({ 'x-forwarded-for': '203.0.113.9' }, [], '10.0.0.5');
    expect(result).toBe('10.0.0.5');
  });

  it('T13: returns socketIp when XFF is absent', () => {
    const result = resolveClientIp({}, ['10.0.0.0/8'], '10.0.0.5');
    expect(result).toBe('10.0.0.5');
  });

  it('T14: resolves client IP through trusted proxy hop', () => {
    const result = resolveClientIp(
      { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' },
      ['10.0.0.0/8'],
      '10.0.0.5',
    );
    expect(result).toBe('203.0.113.9');
  });

  it('T15: ignores forged XFF when socket IP is untrusted', () => {
    const result = resolveClientIp(
      { 'x-forwarded-for': '203.0.113.9' },
      ['10.0.0.0/8'],
      '198.51.100.7',
    );
    expect(result).toBe('198.51.100.7');
  });

  it('T16: skips two trusted hops to find first untrusted client IP', () => {
    const result = resolveClientIp(
      { 'x-forwarded-for': '203.0.113.9, 10.0.0.5, 10.0.0.6' },
      ['10.0.0.0/8'],
      '10.0.0.6',
    );
    expect(result).toBe('203.0.113.9');
  });

  it('T17: returns socketIp when all hops are trusted', () => {
    const result = resolveClientIp(
      { 'x-forwarded-for': '10.0.0.4, 10.0.0.5' },
      ['10.0.0.0/8'],
      '10.0.0.5',
    );
    expect(result).toBe('10.0.0.5');
  });

  it('T18: handles IPv6 addresses and IPv6 CIDRs without throwing', () => {
    expect(() => {
      const result = resolveClientIp(
        { 'x-forwarded-for': '2001:db8:85a3::8a2e:370:7334, 2001:db8::1' },
        ['2001:db8::/32'],
        '2001:db8::1',
      );
      expect(typeof result).toBe('string');
      expect(result).toBeTruthy();
    }).not.toThrow();
  });
});

describe('buildTrustProxy and isTrustedProxy', () => {
  it('T33: buildTrustProxy returns false when TRUST_PROXY_HOPS is 0 and list is empty', () => {
    const result = buildTrustProxy(makeEnv({ TRUST_PROXY_HOPS: 0, TRUSTED_PROXY_LIST: [] }));
    expect(result).toBe(false);
  });

  it('T34: buildTrustProxy returns false when HOPS is 2 but list is empty', () => {
    const result = buildTrustProxy(makeEnv({ TRUST_PROXY_HOPS: 2, TRUSTED_PROXY_LIST: [] }));
    expect(result).toBe(false);
  });

  it('T35: predicate with HOPS: 1 and [10.0.0.0/8] returns true for (10.0.0.5, 0)', () => {
    const predicate = buildTrustProxy(
      makeEnv({ TRUST_PROXY_HOPS: 1, TRUSTED_PROXY_LIST: ['10.0.0.0/8'] }),
    );
    expect(typeof predicate).toBe('function');
    if (typeof predicate === 'function') {
      expect(predicate('10.0.0.5', 0)).toBe(true);
    }
  });

  it('T36: predicate returns false for untrusted peer (198.51.100.9, 0)', () => {
    const predicate = buildTrustProxy(
      makeEnv({ TRUST_PROXY_HOPS: 1, TRUSTED_PROXY_LIST: ['10.0.0.0/8'] }),
    );
    expect(typeof predicate).toBe('function');
    if (typeof predicate === 'function') {
      expect(predicate('198.51.100.9', 0)).toBe(false);
    }
  });

  it('T37: predicate returns false when hop exceeds depth (10.0.0.5, 1)', () => {
    const predicate = buildTrustProxy(
      makeEnv({ TRUST_PROXY_HOPS: 1, TRUSTED_PROXY_LIST: ['10.0.0.0/8'] }),
    );
    expect(typeof predicate).toBe('function');
    if (typeof predicate === 'function') {
      expect(predicate('10.0.0.5', 1)).toBe(false);
    }
  });

  it('T38: predicate returns true for IPv4-mapped address (::ffff:10.0.0.5, 0)', () => {
    const predicate = buildTrustProxy(
      makeEnv({ TRUST_PROXY_HOPS: 1, TRUSTED_PROXY_LIST: ['10.0.0.0/8'] }),
    );
    expect(typeof predicate).toBe('function');
    if (typeof predicate === 'function') {
      expect(predicate('::ffff:10.0.0.5', 0)).toBe(true);
    }
  });

  it('T39: isTrustedProxy ignores invalid entries without throwing', () => {
    expect(isTrustedProxy('10.0.0.5', ['lixo', '10.0.0.0/8'])).toBe(true);
  });

  it('T40: Fastify with buildTrustProxy rejects forged XFF from untrusted peer and extracts client IP from trusted peer', async () => {
    const prodEnv = makeEnv({
      TRUST_PROXY_HOPS: 1,
      TRUSTED_PROXY_LIST: ['10.0.0.0/8'],
    });

    const app = Fastify({
      trustProxy: buildTrustProxy(prodEnv),
    });

    app.get('/test-ip', (req) => ({ ip: req.ip }));

    await app.ready();

    // 1. Socket direto não-confiável com XFF forjado -> forja rejeitada, IP é o socket
    const directRes = await app.inject({
      method: 'GET',
      url: '/test-ip',
      remoteAddress: '198.51.100.9',
      headers: {
        'x-forwarded-for': '9.9.9.9',
      },
    });
    expect(JSON.parse(directRes.body)).toEqual({ ip: '198.51.100.9' });

    // 2. Socket confiável (10.0.0.5) com XFF de múltiplos saltos -> último salto não confiável é o cliente
    const trustedRes = await app.inject({
      method: 'GET',
      url: '/test-ip',
      remoteAddress: '10.0.0.5',
      headers: {
        'x-forwarded-for': '1.2.3.4, 203.0.113.7',
      },
    });
    expect(JSON.parse(trustedRes.body)).toEqual({ ip: '203.0.113.7' });

    // 3. Socket confiável IPv4-mapped (::ffff:10.0.0.5) com XFF -> resolve client IP
    const mappedRes = await app.inject({
      method: 'GET',
      url: '/test-ip',
      remoteAddress: '::ffff:10.0.0.5',
      headers: {
        'x-forwarded-for': '1.2.3.4, 203.0.113.7',
      },
    });
    expect(JSON.parse(mappedRes.body)).toEqual({ ip: '203.0.113.7' });

    await app.close();
  });
});
