import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

export const helmetPlugin = fp(
  async (fastify) => {
    await fastify.register(helmet, {
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    });
  },
  { name: 'helmet-plugin' },
);
