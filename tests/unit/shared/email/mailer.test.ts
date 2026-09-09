import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';
import {
  clearOutbox,
  createMemoryMailer,
  createResendMailer,
  outbox,
} from '../../../../src/shared/email/mailer.js';

describe('mailer', () => {
  beforeEach(() => {
    clearOutbox();
    vi.clearAllMocks();
  });

  it('T1: memory transport enqueues 1 item in outbox', async () => {
    const memoryMailer = createMemoryMailer();

    expect(outbox).toHaveLength(0);

    await memoryMailer.send({
      to: 'joao@example.com',
      subject: 'Bem-vindo ao Cardoso Sound',
      html: '<p>Clique <a href="http://localhost:3333/verify?token=123">aqui</a></p>',
    });

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      to: 'joao@example.com',
      subject: 'Bem-vindo ao Cardoso Sound',
      html: '<p>Clique <a href="http://localhost:3333/verify?token=123">aqui</a></p>',
    });
    expect(outbox[0]?.sentAt).toBeInstanceOf(Date);
  });

  it('T2: resend transport calls emails.send with from, to, subject and html', async () => {
    const sendMock = vi.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const mockResend = {
      emails: {
        send: sendMock,
      },
    } as unknown as Resend;

    const from = 'Cardoso Sound <onboarding@resend.dev>';
    const resendMailer = createResendMailer(mockResend, from);

    await resendMailer.send({
      to: 'maria@example.com',
      subject: 'Redefinição de senha',
      html: '<p>Link de reset</p>',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from,
      to: 'maria@example.com',
      subject: 'Redefinição de senha',
      html: '<p>Link de reset</p>',
    });
    // Resend transport does not pollute memory outbox
    expect(outbox).toHaveLength(0);
  });

  it('T3: provider throw inside send resolves without rejection', async () => {
    const sendMock = vi.fn().mockRejectedValue(new Error('Resend network outage'));
    const mockResend = {
      emails: {
        send: sendMock,
      },
    } as unknown as Resend;

    const resendMailer = createResendMailer(mockResend, 'from@test.com');

    // Must resolve cleanly without throwing
    await expect(
      resendMailer.send({
        to: 'fail@example.com',
        subject: 'Teste de falha',
        html: '<p>conteudo</p>',
      }),
    ).resolves.toBeUndefined();
  });

  it('T3b: provider returning error object resolves without rejection', async () => {
    const sendMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });
    const mockResend = {
      emails: {
        send: sendMock,
      },
    } as unknown as Resend;

    const resendMailer = createResendMailer(mockResend, 'from@test.com');

    await expect(
      resendMailer.send({
        to: 'error@example.com',
        subject: 'Erro API',
        html: '<p>conteudo</p>',
      }),
    ).resolves.toBeUndefined();
  });

  it('clearOutbox() empties outbox array', async () => {
    const memoryMailer = createMemoryMailer();
    await memoryMailer.send({ to: 'a@a.com', subject: 'sub', html: 'html' });
    expect(outbox).toHaveLength(1);

    clearOutbox();
    expect(outbox).toHaveLength(0);
  });

  it('T20: createMemoryMailer(fakeLogger) with NODE_ENV=test does not log url', async () => {
    const fakeLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const memoryMailer = createMemoryMailer(fakeLogger);
    await memoryMailer.send({
      to: 'secret@example.com',
      subject: 'Redefinição de senha',
      html: '<p><a href="http://localhost:3333/api/auth/reset-password?token=secret-token-xyz">Reset</a></p>',
    });

    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
    const logCallArg = fakeLogger.info.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(logCallArg).toBeDefined();
    expect(logCallArg.url).toBeUndefined();
    expect(JSON.stringify(logCallArg)).not.toContain('secret-token-xyz');
  });

  it('T21: resend transport on failure resolves and logs warn without "to" or raw error object', async () => {
    const fakeLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const rawErrorObj = {
      message: 'Internal provider failure',
      name: 'internal_error',
      secretKey: 'sensível',
    };
    const sendMock = vi.fn().mockResolvedValue({
      data: null,
      error: rawErrorObj,
    });
    const mockResend = {
      emails: { send: sendMock },
    } as unknown as Resend;

    const resendMailer = createResendMailer(mockResend, 'from@test.com', fakeLogger);

    await expect(
      resendMailer.send({
        to: 'target-user@example.com',
        subject: 'Confirmação',
        html: '<p>corpo</p>',
      }),
    ).resolves.toBeUndefined();

    expect(fakeLogger.warn).toHaveBeenCalledTimes(1);
    const warnCallArg = fakeLogger.warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(warnCallArg).toBeDefined();
    expect(warnCallArg.to).toBeUndefined();
    expect(warnCallArg.error).toBeUndefined();
    expect(warnCallArg.provider).toBe('resend');
    expect(JSON.stringify(warnCallArg)).not.toContain('target-user@example.com');
    expect(JSON.stringify(warnCallArg)).not.toContain('sensível');
  });

  it('T22: static check verifies no pino() calls exist in src/ outside app.ts (proves D-57)', async () => {
    const { execSync } = await import('node:child_process');
    let output = '';
    try {
      output = execSync('grep -rn "pino(" src/ | grep -v "app.ts" || true', {
        encoding: 'utf-8',
      }).trim();
    } catch {
      output = '';
    }

    expect(output).toBe('');
  });
});
