import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

export const rateLimitPlugin = fp(
  async (fastify) => {
    await fastify.register(rateLimit, {
      global: env.NODE_ENV === 'development',
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
      allowList: (req) => req.url.startsWith('/health'),
      keyGenerator: (req) => (req as unknown as { user?: { id?: string } }).user?.id ?? req.ip,
    });
  },
  { name: 'rate-limit-plugin' },
);
