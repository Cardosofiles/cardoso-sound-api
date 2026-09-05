import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { IncomingHttpHeaders } from 'node:http';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/unauthorized.error.js';
import { auth } from './auth.config.js';

/**
 * Converte o objeto IncomingHttpHeaders do Fastify para o padrão Headers da Fetch API.
 */
export function toFetchHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

const authPluginAsync: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  // 1. Decorators de requisição inicializados estritamente com null
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('session', null);

  // 2. Rota curinga que recebe todas as requisições sob /api/auth/*
  fastify.route({
    method: ['GET', 'POST', 'OPTIONS'],
    url: '/api/auth/*',
    schema: { hide: true }, // Desabilita serialização/validação Zod (corpo gerenciado pelo Better Auth)
    async handler(request, reply) {
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const headers = toFetchHeaders(request.headers);

      const hasBody =
        request.body !== undefined && request.method !== 'GET' && request.method !== 'HEAD';

      const req = new Request(url, {
        method: request.method,
        headers,
        body: hasBody ? JSON.stringify(request.body) : undefined,
      });

      const res = await auth.handler(req);

      reply.status(res.status);

      // Tratamento obrigatório para múltiplos Set-Cookie (D-43 / Armadilha 1)
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length > 0) {
        void reply.header('set-cookie', setCookies);
      }

      // Repasse dos demais headers de resposta, excluindo set-cookie já repassado acima
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') {
          void reply.header(key, value);
        }
      });

      const bodyText = await res.text();
      return reply.send(bodyText || null);
    },
  });

  // 3. Hook global onRequest para resolução passiva de sessão (nunca lança erro)
  fastify.addHook('onRequest', async (request) => {
    try {
      const result = await auth.api.getSession({
        headers: toFetchHeaders(request.headers),
      });

      request.user = result?.user ?? null;
      request.session = result?.session ?? null;
    } catch {
      request.user = null;
      request.session = null;
    }
  });

  // 4. Decorator de guard de rotas para autorização em endpoints protegidos
  fastify.decorate('requireAuth', async (request: FastifyRequest): Promise<void> => {
    await Promise.resolve();
    if (!request.user || !request.session) {
      throw new UnauthorizedError('Authentication required');
    }
  });
};

export const authPlugin = fp(authPluginAsync, {
  name: 'auth-plugin',
  fastify: '5.x',
});
