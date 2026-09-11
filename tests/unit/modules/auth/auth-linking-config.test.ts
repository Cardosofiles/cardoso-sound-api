import { describe, expect, it } from 'vitest';
import { createAuth } from '../../../../src/modules/auth/auth.config.js';

describe('Account Linking & Session FreshAge Configuration Unit Tests (T1–T4)', () => {
  const options = createAuth().options;

  it('T1: options.account.accountLinking.enabled is true', () => {
    expect(options.account.accountLinking.enabled).toBe(true);
  });

  it('T2: options.account.accountLinking.allowDifferentEmails is true (D-58 a)', () => {
    expect(options.account.accountLinking.allowDifferentEmails).toBe(true);
  });

  it('T3: options.account.accountLinking.trustedProviders is exactly ["google", "github"] and excludes facebook (D-58 b)', () => {
    expect(options.account.accountLinking.trustedProviders).toEqual(['google', 'github']);
    expect(options.account.accountLinking.trustedProviders).not.toContain('facebook');
  });

  it('T4: options.session.freshAge is 86400 (24 hours) (D-58 c)', () => {
    expect(options.session.freshAge).toBe(60 * 60 * 24);
    expect(options.session.freshAge).toBe(86400);
  });
});
