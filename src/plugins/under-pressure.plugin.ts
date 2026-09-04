import underPressure from '@fastify/under-pressure';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { checkDatabase } from '../db/client.js';

export const underPressurePlugin = fp(
  async (fastify) => {
    await fastify.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 512 * 1024 * 1024,
      maxRssBytes: 640 * 1024 * 1024,
      retryAfter: 50,
      healthCheck: env.NODE_ENV === 'test' ? undefined : checkDatabase,
      healthCheckInterval: 5000,
      exposeStatusRoute: false,
    });
  },
  { name: 'under-pressure-plugin' },
);
