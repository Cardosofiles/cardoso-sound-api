import { describe, expect, it } from 'vitest';
import { sessionCookieName } from '../../../src/plugins/swagger.plugin.js';

describe('sessionCookieName (T11–T13)', () => {
  it('T11: returns __Secure- prefixed cookie name in production even with http URL', () => {
    expect(sessionCookieName('production', 'http://x')).toBe('__Secure-better-auth.session_token');
  });

  it('T12: returns __Secure- prefixed cookie name in development with https URL', () => {
    expect(sessionCookieName('development', 'https://x')).toBe(
      '__Secure-better-auth.session_token',
    );
  });

  it('T13: returns un-prefixed cookie name in development with http URL', () => {
    expect(sessionCookieName('development', 'http://localhost:3333')).toBe(
      'better-auth.session_token',
    );
  });
});
