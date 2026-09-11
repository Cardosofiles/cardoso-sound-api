import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { createRequire } from 'node:module';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env, type Env } from '../config/env.js';

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Extrai o token de sessão do cabeçalho Authorization (Bearer) ou do cookie HTTP.
 * Não consulta banco de dados nem valida assinatura (GAP-11 / Spec 08 §3.2).
 */
export function extractSessionToken(headers: IncomingHttpHeaders): string | null {
  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = headers.cookie;
  if (typeof cookieHeader === 'string' && cookieHeader.length > 0) {
    const cookies = cookieHeader.split(';');
    let fallbackToken: string | null = null;

    for (const chunk of cookies) {
      const eq = chunk.indexOf('=');
      if (eq === -1) continue;
      const key = chunk.slice(0, eq).trim();
      const val = chunk.slice(eq + 1).trim();

      if (key === '__Secure-better-auth.session_token' && val) {
        return decodeURIComponent(val);
      }
      if (key === 'better-auth.session_token' && val) {
        fallbackToken = decodeURIComponent(val);
      }
    }
    if (fallbackToken) return fallbackToken;
  }

  return null;
}

/**
 * Gerador de chave do rate limit para Fastify (Spec 08 §3.2).
 * - /api/auth/** -> estritamente req.ip (evita multiplicação de cota em rotas de autenticação)
 * - /api/v1/** -> IP + hash(token) se autenticado, ou apenas IP se anônimo.
 */
export function rateLimitKeyGenerator(req: FastifyRequest): string {
  const ip = req.ip;
  if (req.url.startsWith('/api/auth')) return ip;
  const token = extractSessionToken(req.headers);
  return token ? `${ip}|${sha256(token).slice(0, 16)}` : ip;
}

/**
 * Ponto de extensão para instanciar o cliente Redis dinamicamente (D-55 / §5.4).
 * Se RATE_LIMIT_REDIS_URL for fornecido mas ioredis não estiver instalado, falha de forma fechada e legível.
 */
type RedisConstructor = new (url: string) => unknown;

export function createRedisClient(redisUrl: string): unknown {
  try {
    const nodeRequire = createRequire(import.meta.url) as unknown as (
      id: string,
    ) => RedisConstructor;
    const Redis = nodeRequire('ioredis');
    return new Redis(redisUrl);
  } catch {
    throw new Error(
      'RATE_LIMIT_REDIS_URL está definida mas `ioredis` não está instalado.\n' +
        'Rode `pnpm add ioredis` e registre o ADR correspondente (D-32).',
    );
  }
}

export function buildRateLimitOptions(config: Env): RateLimitPluginOptions {
  return {
    global: config.NODE_ENV === 'production',
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    allowList: (req: FastifyRequest) => req.url.startsWith('/health'),
    keyGenerator: rateLimitKeyGenerator,
    ...(config.RATE_LIMIT_REDIS_URL
      ? { redis: createRedisClient(config.RATE_LIMIT_REDIS_URL) }
      : {}),
  };
}

export const rateLimitPlugin = fp(
  async (fastify) => {
    await fastify.register(rateLimit, buildRateLimitOptions(env));
  },
  { name: 'rate-limit-plugin' },
);
