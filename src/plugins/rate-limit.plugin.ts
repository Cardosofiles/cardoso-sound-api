import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env, type Env } from '../config/env.js';

export function buildRateLimitOptions(config: Env): RateLimitPluginOptions {
  return {
    global: config.NODE_ENV === 'production',
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    allowList: (req: FastifyRequest) => req.url.startsWith('/health'),
    keyGenerator: (req: FastifyRequest) => req.ip,
  };
}

export const rateLimitPlugin = fp(
  async (fastify) => {
    await fastify.register(rateLimit, buildRateLimitOptions(env));
  },
  { name: 'rate-limit-plugin' },
);
