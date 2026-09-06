import { pino } from 'pino';
import { Resend } from 'resend';
import { env, isDevelopment } from '../../config/env.js';

const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      }
    : undefined,
});

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

export function createMemoryMailer(): Mailer {
  return {
    send(input: { to: string; subject: string; html: string }): Promise<void> {
      const sentEmail: SentEmail = {
        to: input.to,
        subject: input.subject,
        html: input.html,
        sentAt: new Date(),
      };
      _outbox.push(sentEmail);

      // Em desenvolvimento e teste, extrai a URL do href para exibir no log legível
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

      return Promise.resolve();
    },
  };
}

export function createResendMailer(resendClient: Resend, from: string): Mailer {
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
              to: input.to,
              subject: input.subject,
              error,
            },
            '[ResendMailer] Provedor retornou erro no envio de e-mail',
          );
        }
      } catch (err: unknown) {
        // Armadilha 1 / T3: falha do provedor nunca rejeita a promise
        logger.warn(
          {
            to: input.to,
            subject: input.subject,
            err,
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
