import cors from '@fastify/cors';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

export const corsPlugin = fp(
  async (fastify) => {
    await fastify.register(cors, {
      origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN_LIST : true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      exposedHeaders: ['set-auth-token'],
    });
  },
  { name: 'cors-plugin' },
);
