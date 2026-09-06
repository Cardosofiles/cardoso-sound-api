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
});
