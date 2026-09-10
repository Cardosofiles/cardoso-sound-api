import { describe, expect, it } from 'vitest';
import {
  shouldResolveSession,
  toFetchHeaders,
  toRfc7807,
} from '../../../../src/modules/auth/auth.plugin.js';

describe('auth.plugin unit tests (T1–T10, T29–T31)', () => {
  describe('shouldResolveSession (T1–T4)', () => {
    it('T1: returns false for /health and /health/ready', () => {
      expect(shouldResolveSession('/health')).toBe(false);
      expect(shouldResolveSession('/health/ready')).toBe(false);
      expect(shouldResolveSession('/health/live')).toBe(false);
    });

    it('T2: returns false for /api/auth endpoints', () => {
      expect(shouldResolveSession('/api/auth/get-session')).toBe(false);
      expect(shouldResolveSession('/api/auth/sign-in/email')).toBe(false);
      expect(shouldResolveSession('/api/auth/sign-up/email')).toBe(false);
    });

    it('T3: returns true for domain routes (/api/v1/me, /api/v1/tracks, etc.)', () => {
      expect(shouldResolveSession('/api/v1/me')).toBe(true);
      expect(shouldResolveSession('/api/v1/tracks')).toBe(true);
      expect(shouldResolveSession('/api/v1/playlists')).toBe(true);
      expect(shouldResolveSession('/api/v1/favorites')).toBe(true);
    });

    it('T4: returns true for documentation routes (/docs)', () => {
      expect(shouldResolveSession('/docs')).toBe(true);
      expect(shouldResolveSession('/docs/json')).toBe(true);
    });
  });

  describe('toRfc7807 (T5–T10)', () => {
    it('T5: keeps code and message, adds statusCode, error, details on 401', () => {
      const input = JSON.stringify({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      });
      const output = toRfc7807(401, input);
      const parsed = JSON.parse(output) as Record<string, unknown>;

      expect(parsed.code).toBe('INVALID_EMAIL_OR_PASSWORD');
      expect(parsed.message).toBe('Invalid email or password');
      expect(parsed.statusCode).toBe(401);
      expect(parsed.error).toBe('Unauthorized');
      expect(parsed.details).toBeNull();
    });

    it('T6: returns rawBody untouched for success status 200', () => {
      const input = JSON.stringify({ user: { id: 'usr_1' }, token: 'tok_abc' });
      const output = toRfc7807(200, input);
      expect(output).toBe(input);
    });

    it('T7: returns rawBody untouched for non-JSON HTML body on 400', () => {
      const input = '<html>erro</html>';
      const output = toRfc7807(400, input);
      expect(output).toBe(input);
    });

    it('T8: returns empty string untouched on status 500 with empty body', () => {
      const input = '';
      const output = toRfc7807(500, input);
      expect(output).toBe(input);
    });

    it('T9: returns rawBody untouched for array JSON on 400', () => {
      const input = JSON.stringify([1, 2, 3]);
      const output = toRfc7807(400, input);
      expect(output).toBe(input);
    });

    it('T10: derives error name from status code (e.g. 404 -> Not Found)', () => {
      const input = JSON.stringify({ message: 'Resource not found' });
      const output = toRfc7807(404, input);
      const parsed = JSON.parse(output) as Record<string, unknown>;

      expect(parsed.statusCode).toBe(404);
      expect(parsed.error).toBe('Not Found');
      expect(parsed.message).toBe('Resource not found');
      expect(parsed.details).toBeNull();
    });
  });

  describe('toFetchHeaders with clientIp (R-01 — T29–T31)', () => {
    it('T29: overrides client x-forwarded-for when clientIp is provided', () => {
      const headers = toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' }, '198.51.100.9');
      expect(headers.get('x-forwarded-for')).toBe('198.51.100.9');
    });

    it('T30: asserts x-forwarded-for count is exactly 1 (set, not append)', () => {
      const headers = toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' }, '198.51.100.9');
      // No Fetch API Headers, se get() devolver '198.51.100.9', não há múltiplos valores concatenados com vírgula
      const value = headers.get('x-forwarded-for');
      expect(value).toBe('198.51.100.9');
      expect(value?.split(',')).toHaveLength(1);
    });

    it('T31: preserves incoming x-forwarded-for when clientIp is not provided (retrocompatible)', () => {
      const headers = toFetchHeaders({ 'x-forwarded-for': '6.6.6.6' });
      expect(headers.get('x-forwarded-for')).toBe('6.6.6.6');
    });
  });
});
