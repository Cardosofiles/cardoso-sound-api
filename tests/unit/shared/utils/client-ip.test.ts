import { describe, expect, it } from 'vitest';
import { resolveClientIp } from '../../../../src/shared/utils/client-ip.js';

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
