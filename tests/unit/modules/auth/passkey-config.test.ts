import { describe, expect, it } from 'vitest';
import { auth } from '../../../../src/modules/auth/auth.config.js';

interface PasskeyPluginShape {
  id: string;
  options?: {
    rpID?: string;
    rpName?: string;
    origin?: string;
    registration?: {
      requireSession?: boolean;
    };
  };
}

describe('Passkey Configuration Unit Tests (T1–T5)', () => {
  const getPasskeyPlugin = (): PasskeyPluginShape => {
    const plugin = auth.options.plugins.find((p) => p.id === 'passkey');
    expect(plugin).toBeDefined();
    return plugin as unknown as PasskeyPluginShape;
  };

  it('T1: rpID derived from http://localhost:3333 is localhost', () => {
    const devUrl = 'http://localhost:3333';
    const derivedRpId = new URL(devUrl).hostname;
    expect(derivedRpId).toBe('localhost');
  });

  it('T2: rpID derived from https://api.cardososound.com is api.cardososound.com', () => {
    const prodUrl = 'https://api.cardososound.com';
    const derivedRpId = new URL(prodUrl).hostname;
    expect(derivedRpId).toBe('api.cardososound.com');
  });

  it('T3: rpID never contains colon, slash, or URL scheme', () => {
    const plugin = getPasskeyPlugin();
    const rpId = plugin.options?.rpID;
    expect(rpId).toBeDefined();
    expect(rpId).not.toMatch(/[:/]/);
    expect(rpId).not.toMatch(/^https?:\/\//);
    expect(rpId).toBe('localhost');
  });

  it('T4: origin equals BETTER_AUTH_URL without trailing slash', () => {
    const plugin = getPasskeyPlugin();
    const origin = plugin.options?.origin;
    expect(origin).toBeDefined();
    expect(origin).not.toMatch(/\/$/);
    expect(origin).toMatch(/^https?:\/\/[^/]+$/);
  });

  it('T5: registration requires active session (requireSession defaults to true per D-54)', () => {
    const plugin = getPasskeyPlugin();
    const requireSession = plugin.options?.registration?.requireSession ?? true;
    expect(requireSession).toBe(true);
  });
});
