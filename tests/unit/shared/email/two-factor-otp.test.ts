import { describe, expect, it } from 'vitest';
import { twoFactorOtpEmail } from '../../../../src/shared/email/templates.js';

describe('twoFactorOtpEmail Unit Tests (T25–T28)', () => {
  // T25: twoFactorOtpEmail({ name, otp: '123456' }) -> html contém 123456
  it('T25: html contains the provided OTP code', () => {
    const result = twoFactorOtpEmail({
      name: 'João Silva',
      otp: '123456',
    });

    expect(result.html).toContain('123456');
    expect(result.html).toContain('João Silva');
    expect(result.html).toContain('10 minutos');
  });

  // T26: O OTP não aparece dentro de nenhum href (evita vazamento em logs/Referer)
  it('T26: OTP code does not appear inside any href attribute', () => {
    const otp = '987654';
    const result = twoFactorOtpEmail({
      name: 'Maria Santos',
      otp,
    });

    // Garante que não existe nenhum href com o código
    const hrefRegex = new RegExp(`href=["'][^"']*${otp}[^"']*["']`, 'i');
    expect(hrefRegex.test(result.html)).toBe(false);

    // Garante que não há nenhuma tag <a> no template
    expect(result.html).not.toMatch(/<a\s/i);
  });

  // T27: name com payload malicioso é sanitizado (GAP-22)
  it('T27: escapes HTML tags and special characters in name to prevent XSS (GAP-22)', () => {
    const maliciousName = '<script>alert(1)</script>" onclick="evil()"';
    const result = twoFactorOtpEmail({
      name: maliciousName,
      otp: '654321',
    });

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('</script>');
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).toContain('&quot;');
  });

  // T28: subject não vazio e sem o OTP (não vazar em push/lock screen)
  it('T28: subject is non-empty and does not contain the OTP code', () => {
    const otp = '789012';
    const result = twoFactorOtpEmail({
      name: 'Carlos Oliveira',
      otp,
    });

    expect(result.subject).toBeDefined();
    expect(result.subject.trim().length).toBeGreaterThan(0);
    expect(result.subject).not.toContain(otp);
    expect(result.subject).toContain('Cardoso Sound');
  });
});
