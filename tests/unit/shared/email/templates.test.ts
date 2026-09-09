import { describe, expect, it } from 'vitest';
import { resetPasswordEmail, verificationEmail } from '../../../../src/shared/email/templates.js';

describe('email templates', () => {
  const mockUrl =
    'https://cardososound.example.com/api/auth/verify-email?token=super-secret-token-123';
  const mockResetUrl =
    'https://cardososound.example.com/api/auth/reset-password?token=reset-token-456';

  it('T4: verificationEmail({ name, url }) contains the exact received URL in html', () => {
    const template = verificationEmail({
      name: 'João Batista',
      url: mockUrl,
    });

    expect(template.subject).toBe('Verifique seu e-mail no Cardoso Sound');
    expect(template.html).toContain(mockUrl);
    expect(template.html).toContain(`href="${mockUrl}"`);
  });

  it('T5: resetPasswordEmail({ name, url }) contains the exact URL and non-empty subject', () => {
    const template = resetPasswordEmail({
      name: 'Maria Silva',
      url: mockResetUrl,
    });

    expect(template.subject).toBeTruthy();
    expect(template.subject.length).toBeGreaterThan(0);
    expect(template.html).toContain(mockResetUrl);
    expect(template.html).toContain(`href="${mockResetUrl}"`);
  });

  it('T6: neither template exposes the token outside of href attribute', () => {
    const token = 'unique-random-token-xyz-789';
    const verifyUrl = `http://localhost:3333/api/auth/verify-email?token=${token}`;
    const resetUrl = `http://localhost:3333/api/auth/reset-password?token=${token}`;

    const verifyResult = verificationEmail({ name: 'User', url: verifyUrl });
    const resetResult = resetPasswordEmail({ name: 'User', url: resetUrl });

    // Remove all href="..." occurrences from the HTML
    const verifyWithoutHref = verifyResult.html.replace(/href="[^"]*"/g, '');
    const resetWithoutHref = resetResult.html.replace(/href="[^"]*"/g, '');

    // The token must not appear outside the href attribute
    expect(verifyWithoutHref).not.toContain(token);
    expect(resetWithoutHref).not.toContain(token);

    // Subject must also not leak the token
    expect(verifyResult.subject).not.toContain(token);
    expect(resetResult.subject).not.toContain(token);
  });

  it('T23: verificationEmail({ name, url: "https://x/?t=1&a="><b>" }) escapes quotes and < in href', () => {
    const maliciousUrl = 'https://x/?t=1&a="><b>';
    const result = verificationEmail({ name: 'User', url: maliciousUrl });

    expect(result.html).toContain('href="https://x/?t=1&amp;a=&quot;&gt;&lt;b&gt;"');
    expect(result.html).not.toContain('href="https://x/?t=1&a="><b>"');
  });

  it('T24: resetPasswordEmail({ name, url: "https://x/?t=1&a="><b>" }) escapes quotes and < in href', () => {
    const maliciousUrl = 'https://x/?t=1&a="><b>';
    const result = resetPasswordEmail({ name: 'User', url: maliciousUrl });

    expect(result.html).toContain('href="https://x/?t=1&amp;a=&quot;&gt;&lt;b&gt;"');
    expect(result.html).not.toContain('href="https://x/?t=1&a="><b>"');
  });

  it('T25: both templates with name: "<script>" have name properly escaped (regression protection)', () => {
    const maliciousName = '<script>alert(1)</script>';
    const verifyResult = verificationEmail({ name: maliciousName, url: mockUrl });
    const resetResult = resetPasswordEmail({ name: maliciousName, url: mockResetUrl });

    expect(verifyResult.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(verifyResult.html).not.toContain('<script>alert(1)</script>');

    expect(resetResult.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(resetResult.html).not.toContain('<script>alert(1)</script>');
  });
});
