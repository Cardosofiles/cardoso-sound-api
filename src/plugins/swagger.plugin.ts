import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { createRequire } from 'node:module';
import { APP_NAME } from '../config/constants.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; description?: string };

export const swaggerPlugin = fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: APP_NAME,
          description:
            pkg.description ||
            'API RESTful para catálogo e streaming do Cardoso Sound construída com Fastify, PostgreSQL e TypeScript.',
          version: pkg.version,
        },
        tags: [
          {
            name: 'Health',
            description: 'Monitoramento de liveness e readiness da aplicação e banco de dados',
          },
          {
            name: 'Auth',
            description: 'Autenticação, sessões e credenciais de usuários (Better Auth)',
          },
          {
            name: 'Catalog',
            description: 'Catálogo musical público com artistas, faixas e gêneros',
          },
          { name: 'Profile', description: 'Gerenciamento do perfil do usuário autenticado' },
          { name: 'Library', description: 'Playlists particulares e faixas favoritas do usuário' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Bearer token gerado pelo Better Auth (usado pelo aplicativo Flutter)',
            },
            cookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: 'better-auth.session_token',
              description: 'Cookie de sessão httpOnly do Better Auth (usado pelo Swagger UI)',
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  },
  { name: 'swagger-plugin' },
);
