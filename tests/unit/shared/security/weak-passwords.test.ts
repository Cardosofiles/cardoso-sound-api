import { describe, expect, it } from 'vitest';
import { isWeakPassword } from '../../../../src/shared/security/weak-passwords.js';

describe('weak-passwords security utility', () => {
  it('T26: isWeakPassword("password") returns true', () => {
    expect(isWeakPassword('password')).toBe(true);
  });

  it('T27: isWeakPassword("PASSWORD") returns true (case-insensitive check)', () => {
    expect(isWeakPassword('PASSWORD')).toBe(true);
    expect(isWeakPassword('Password123')).toBe(true);
    expect(isWeakPassword('12345678')).toBe(true);
  });

  it('T28: random 24-character password returns false', () => {
    expect(isWeakPassword('k8#mP9$xL2!vQ7@wR4^zT1*y')).toBe(false);
    expect(isWeakPassword('MinhaSenhaSuperSegura!2026#F5S03')).toBe(false);
  });

  it('isWeakPassword handles edge cases (empty or whitespace)', () => {
    expect(isWeakPassword('')).toBe(true);
    expect(isWeakPassword('   password   ')).toBe(true);
  });
});
