import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../../src/app.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { ConflictError, NotFoundError } from '../../../src/shared/errors/index.js';

describe('Error Handler Plugin and App Factory', () => {
  // T6: Rota que lança NotFoundError -> 404 com os 4 campos do envelope
  it('T6: handles NotFoundError returning status 404 and the exact 4 envelope fields', async () => {
    const app = await buildApp();
    app.get('/test/not-found', () => {
      throw new NotFoundError('Track not found');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/not-found',
    });

    expect(response.statusCode).toBe(404);
    const json = response.json<ErrorResponseEnvelope>();
    expect(json).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Track not found',
      details: null,
    });
  });

  // T7: Rota que lança ConflictError -> 409
  it('T7: handles ConflictError returning status 409 and formatted envelope', async () => {
    const app = await buildApp();
    app.post('/test/conflict', () => {
      throw new ConflictError('Track already in playlist');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/test/conflict',
    });

    expect(response.statusCode).toBe(409);
    const json = response.json<ErrorResponseEnvelope>();
    expect(json).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Track already in playlist',
      details: null,
    });
  });

  // T8: Rota com body inválido pelo schema Zod -> 400, details não-nulo
  it('T8: handles Zod schema validation errors with 400 and non-null details', async () => {
    const app = await buildApp();
    app.post(
      '/test/validation',
      {
        schema: {
          body: z.object({
            title: z.string(),
            duration: z.number(),
          }),
        },
      },
      () => ({ ok: true }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/test/validation',
      payload: {
        title: 123, // inválido: esperado string
        // duration faltando
      },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json<ErrorResponseEnvelope>();
    expect(json.statusCode).toBe(400);
    expect(json.error).toBe('Bad Request');
    expect(json.message).toBeDefined();
    expect(json.details).not.toBeNull();
    expect(Array.isArray(json.details)).toBe(true);
    const issues = json.details as unknown[];
    expect(issues.length).toBeGreaterThan(0);
  });

  // T9: Rota que lança new Error('segredo interno') -> 500 e corpo NÃO contém segredo nem stack
  it('T9: handles unhandled errors with 500 without leaking message, stack, or internal details', async () => {
    const app = await buildApp();
    app.get('/test/unhandled', () => {
      throw new Error('segredo interno ultraconfidencial');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unhandled',
    });

    expect(response.statusCode).toBe(500);
    const json = response.json<ErrorResponseEnvelope>();
    expect(json).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
      details: null,
    });

    expect(response.body).not.toContain('segredo interno ultraconfidencial');
    expect(response.body).not.toContain('stack');
    expect(response.body).not.toContain('cause');
  });

  // T10: URL inexistente -> 404 com o mesmo envelope (não o HTML/JSON padrão do Fastify)
  it('T10: returns 404 with standardized error envelope for non-existent routes', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/non-existent-route',
    });

    expect(response.statusCode).toBe(404);
    const json = response.json<ErrorResponseEnvelope>();
    expect(json).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route GET /api/v1/non-existent-route not found',
      details: null,
    });
  });

  // T11: Envelope tem exatamente statusCode, error, message, details -> nenhuma chave extra
  it('T11: ensures error envelope strictly contains only statusCode, error, message, details keys', async () => {
    const app = await buildApp();
    app.get('/test/keys-check', () => {
      throw new NotFoundError('Item not found');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/keys-check',
    });

    const json = response.json<Record<string, unknown>>();
    const expectedKeys = ['details', 'error', 'message', 'statusCode'];
    expect(Object.keys(json).sort()).toEqual(expectedKeys);
  });

  // T12 (Caso adicional Fastify status code): Trata erro Fastify entre 400 e 499 (ex: 429)
  it('handles Fastify errors with numeric status code (429) normalizing envelope', async () => {
    const app = await buildApp();
    app.get('/test/rate-limit-simulation', () => {
      const error = new Error('Rate limit exceeded, retry later');
      Object.assign(error, { statusCode: 429 });
      throw error;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/rate-limit-simulation',
    });

    expect(response.statusCode).toBe(429);
    const json = response.json<ErrorResponseEnvelope>();
    expect(json).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry later',
      details: null,
    });
  });

  // T13 (D-22): Verificação de configuração de redaction do Pino cobrindo os 6 caminhos
  it('T13: proves Pino redact censors all 6 sensitive paths', () => {
    let logged = '';
    const destination = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        logged += chunk.toString();
        callback();
      },
    });

    const pinoLogger = pino(
      {
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'res.headers["set-auth-token"]',
            '*.password',
            '*.token',
          ],
          censor: '[REDACTED]',
        },
      },
      destination,
    );

    pinoLogger.info({
      req: {
        headers: {
          authorization: 'Bearer secret-jwt',
          cookie: 'sessionId=secret-session',
        },
      },
      res: {
        headers: {
          'set-cookie': 'session=abc',
          'set-auth-token': 'token-xyz',
        },
      },
      payload: {
        password: 'secret-password',
        token: 'sensitive-token',
      },
    });

    expect(logged).toContain('"authorization":"[REDACTED]"');
    expect(logged).toContain('"cookie":"[REDACTED]"');
    expect(logged).toContain('"set-cookie":"[REDACTED]"');
    expect(logged).toContain('"set-auth-token":"[REDACTED]"');
    expect(logged).toContain('"password":"[REDACTED]"');
    expect(logged).toContain('"token":"[REDACTED]"');
    expect(logged).not.toContain('secret-jwt');
    expect(logged).not.toContain('secret-session');
    expect(logged).not.toContain('secret-password');
    expect(logged).not.toContain('sensitive-token');
  });

  // T14: buildApp() não abre porta nem conexão ao ser importado
  it('confirms buildApp() does not listen on a port or have import-time side effects', async () => {
    const app = await buildApp();
    expect(app.server.listening).toBe(false);
    await app.close();
  });
});
