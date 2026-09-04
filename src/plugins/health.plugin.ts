import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import fp from 'fastify-plugin';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { checkDatabase } from '../db/client.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  version: z.string(),
});

const readinessOkResponseSchema = z.object({
  status: z.literal('ready'),
  database: z.literal('up'),
});

const readinessUnavailableResponseSchema = z.object({
  status: z.literal('unavailable'),
  database: z.literal('down'),
});

const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  await Promise.resolve();

  // R01: Liveness check — sempre 200, não toca no banco
  fastify.get(
    '/health',
    {
      config: { pressureHandler: () => {} },
      schema: {
        tags: ['Health'],
        summary: 'Liveness health check',
        description:
          'Verifica se a instância da API está ativa e responsiva. Não toca no banco de dados.',
        operationId: 'getHealth',
        response: {
          200: healthResponseSchema,
        },
      },
    },
    () => {
      return {
        status: 'ok' as const,
        uptime: process.uptime(),
        version: pkg.version,
      };
    },
  );

  // R02: Readiness check — 200 se conectividade com o banco ok, 503 se falhar
  fastify.get(
    '/health/ready',
    {
      config: { pressureHandler: () => {} },
      schema: {
        tags: ['Health'],
        summary: 'Readiness health check',
        description:
          'Verifica a conectividade com o banco de dados PostgreSQL antes de receber tráfego.',
        operationId: 'getHealthReady',
        response: {
          200: readinessOkResponseSchema,
          503: readinessUnavailableResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const isDbHealthy = await checkDatabase();

      if (!isDbHealthy) {
        return reply.status(503).send({
          status: 'unavailable' as const,
          database: 'down' as const,
        });
      }

      return reply.status(200).send({
        status: 'ready' as const,
        database: 'up' as const,
      });
    },
  );
};

export const healthPlugin = fp(healthRoutes, {
  name: 'health-plugin',
});
