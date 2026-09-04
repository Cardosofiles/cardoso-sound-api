import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { errorHandlerPlugin } from './plugins/error-handler.plugin.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
              },
            }
          : undefined,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'res.headers["set-auth-token"]',
          '*.password',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: (req) =>
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID().slice(0, 8),
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  // Compiladores do type provider Zod devem ser registrados antes de qualquer rota
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Tratamento central de erros
  await app.register(errorHandlerPlugin);

  return app;
}
