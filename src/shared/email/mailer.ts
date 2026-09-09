import type { FastifyBaseLogger } from 'fastify';
import { Resend } from 'resend';
import { env, isDevelopment } from '../../config/env.js';

export type MailerLogger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

const silentLogger: MailerLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  sentAt: Date;
}

export interface Mailer {
  send(input: { to: string; subject: string; html: string }): Promise<void>;
}

const _outbox: SentEmail[] = [];
export const outbox: readonly SentEmail[] = _outbox;

export function clearOutbox(): void {
  _outbox.length = 0;
}

export function createMemoryMailer(logger: MailerLogger = silentLogger): Mailer {
  return {
    send(input: { to: string; subject: string; html: string }): Promise<void> {
      const sentEmail: SentEmail = {
        to: input.to,
        subject: input.subject,
        html: input.html,
        sentAt: new Date(),
      };
      _outbox.push(sentEmail);

      // O transporte de memória só loga a URL quando NODE_ENV === 'development'. Em test e production, nunca.
      if (isDevelopment) {
        const urlMatch = /href="([^"]+)"/.exec(input.html);
        const extractedUrl = urlMatch ? urlMatch[1] : undefined;

        logger.info(
          {
            to: input.to,
            subject: input.subject,
            url: extractedUrl,
          },
          '[MemoryMailer] E-mail acumulado no outbox',
        );
      } else {
        logger.info(
          {
            subject: input.subject,
          },
          '[MemoryMailer] E-mail acumulado no outbox',
        );
      }

      return Promise.resolve();
    },
  };
}

export function createResendMailer(
  resendClient: Resend,
  from: string,
  logger: MailerLogger = silentLogger,
): Mailer {
  return {
    async send(input: { to: string; subject: string; html: string }): Promise<void> {
      try {
        const { error } = await resendClient.emails.send({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
        });

        if (error) {
          logger.warn(
            {
              provider: 'resend',
              status: error.name,
              message: error.message,
            },
            '[ResendMailer] Provedor retornou erro no envio de e-mail',
          );
        }
      } catch (err: unknown) {
        // Armadilha 1 / T3: falha do provedor nunca rejeita a promise
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(
          {
            provider: 'resend',
            status: 'exception',
            message: errorMessage,
          },
          '[ResendMailer] Exceção capturada no envio de e-mail',
        );
      }
    },
  };
}

export const mailer: Mailer = env.RESEND_API_KEY
  ? createResendMailer(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM)
  : createMemoryMailer();
