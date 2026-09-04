import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { corsPlugin } from './plugins/cors.plugin.js';
import { errorHandlerPlugin } from './plugins/error-handler.plugin.js';
import { healthPlugin } from './plugins/health.plugin.js';
import { helmetPlugin } from './plugins/helmet.plugin.js';
import { rateLimitPlugin } from './plugins/rate-limit.plugin.js';
import { swaggerPlugin } from './plugins/swagger.plugin.js';
import { underPressurePlugin } from './plugins/under-pressure.plugin.js';

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
  }).withTypeProvider<ZodTypeProvider>();

  // Compiladores do type provider Zod devem ser registrados antes de qualquer rota
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 1. Tratamento central de erros (primeiro, para capturar falhas dos demais)
  await app.register(errorHandlerPlugin);

  // 2. Plugins de defesa e resiliência de borda
  await app.register(helmetPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(underPressurePlugin);

  // 3. Documentação OpenAPI e Swagger UI
  await app.register(swaggerPlugin);

  // 4. Rotas de monitoramento de saúde (liveness e readiness)
  await app.register(healthPlugin);

  return app;
}
