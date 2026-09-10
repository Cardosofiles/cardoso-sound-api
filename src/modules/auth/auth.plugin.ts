import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { STATUS_CODES, type IncomingHttpHeaders } from 'node:http';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/unauthorized.error.js';
import { auth } from './auth.config.js';

/**
 * Converte o objeto IncomingHttpHeaders do Fastify para o padrão Headers da Fetch API.
 * R-01 — quando `clientIp` é passado, o `x-forwarded-for` do cliente é SOBRESCRITO por ele.
 * Sem `clientIp`, o comportamento anterior é preservado.
 */
export function toFetchHeaders(incoming: IncomingHttpHeaders, clientIp?: string): Headers {
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
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp);
  }
  return headers;
}

/**
 * Predicado que determina se a sessão deve ser resolvida no hook onRequest (GAP-13).
 * Rotas de sondas (/health*) e a rota curinga de autenticação (/api/auth*) sofrem bypass.
 */
export function shouldResolveSession(url: string): boolean {
  return !url.startsWith('/health') && !url.startsWith('/api/auth');
}

/**
 * Converte payloads de erro (status >= 400) do Better Auth no envelope RFC 7807 (GAP-26).
 * Preserva integralmente code e message originais e repassa corpos não-JSON intactos.
 */
export function toRfc7807(status: number, rawBody: string): string {
  if (status < 400) return rawBody;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return rawBody;
  }
  return JSON.stringify({
    ...parsed,
    statusCode: status,
    error: STATUS_CODES[status] ?? 'Error',
    details: null,
  });
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
      const headers = toFetchHeaders(request.headers, request.ip);

      const hasBody =
        request.body !== undefined && request.method !== 'GET' && request.method !== 'HEAD';

      const req = new Request(url, {
        method: request.method,
        headers,
        body: hasBody ? JSON.stringify(request.body) : undefined,
      });

      const res = await auth.handler(req);

      reply.status(res.status);

      // Tratamento obrigatório para múltiplos Set-Cookie (D-44 / Armadilha 1)
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length > 0) {
        void reply.header('set-cookie', setCookies);
      }

      // Repasse dos demais headers de resposta, excluindo set-cookie e content-length (Armadilha 1)
      res.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower !== 'set-cookie' && lower !== 'content-length') {
          void reply.header(key, value);
        }
      });

      const bodyText = await res.text();
      const transformedBody = toRfc7807(res.status, bodyText);
      return reply.send(transformedBody || null);
    },
  });

  // 3. Hook global onRequest para resolução passiva de sessão (nunca lança erro)
  fastify.addHook('onRequest', async (request) => {
    if (!shouldResolveSession(request.url)) {
      request.user = null;
      request.session = null;
      return;
    }

    try {
      const result = await auth.api.getSession({
        headers: toFetchHeaders(request.headers, request.ip),
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
