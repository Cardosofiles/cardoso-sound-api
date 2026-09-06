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
});
