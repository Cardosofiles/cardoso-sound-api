import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { createRequire } from 'node:module';
import { APP_NAME } from '../config/constants.js';
import { env } from '../config/env.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; description?: string };

export function shouldExposeSwaggerUi(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}

export function sessionCookieName(nodeEnv: string, baseUrl: string): string {
  const isSecure = nodeEnv === 'production' || baseUrl.startsWith('https://');
  return isSecure ? '__Secure-better-auth.session_token' : 'better-auth.session_token';
}

export const swaggerPlugin = fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: APP_NAME,
          version: pkg.version,
          description:
            'API de catálogo musical para o app Flutter. ' +
            'As rotas de autenticação (/api/auth/*) são gerenciadas pelo Better Auth com suporte simultâneo a Bearer Token e Cookie HttpOnly.',
        },
        servers: [{ url: 'http://localhost:3333', description: 'Local' }],
        tags: [
          { name: 'Health', description: 'Liveness e readiness' },
          { name: 'Auth', description: 'Cadastro, login e sessão' },
          { name: 'Catalog', description: 'Faixas, artistas e gêneros (público)' },
          { name: 'Profile', description: 'Perfil do usuário autenticado' },
          { name: 'Library', description: 'Playlists e favoritos' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
            cookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: sessionCookieName(env.NODE_ENV, env.BETTER_AUTH_URL),
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    if (shouldExposeSwaggerUi(env.NODE_ENV)) {
      await fastify.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
          docExpansion: 'list',
          deepLinking: true,
        },
      });
    }
  },
  { name: 'swagger-plugin' },
);
