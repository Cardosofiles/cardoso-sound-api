import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../src/app.js';
import * as dbClient from '../../../src/db/client.js';

describe('Health, Border Plugins and Swagger (Unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // T1: GET /health -> 200, status: 'ok', uptime numérico > 0
  it('T1: GET /health returns status 200 with ok status, numeric uptime > 0 and package version', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const json = res.json<{ status: string; uptime: number; version: string }>();
    expect(json.status).toBe('ok');
    expect(typeof json.uptime).toBe('number');
    expect(json.uptime).toBeGreaterThan(0);
    expect(json.version).toBe('0.1.0');
  });

  // T2: GET /health com o banco fora -> ainda 200 — liveness não depende do banco
  it('T2: GET /health returns status 200 even when database check fails (liveness independent from database)', async () => {
    vi.spyOn(dbClient, 'checkDatabase').mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const json = res.json<{ status: string; uptime: number; version: string }>();
    expect(json.status).toBe('ok');
    expect(typeof json.uptime).toBe('number');
    expect(json.uptime).toBeGreaterThan(0);
  });

  // T3: GET /health/ready com checagem ok -> 200, database: 'up'
  it('T3: GET /health/ready returns status 200 with database: up when database check succeeds', async () => {
    vi.spyOn(dbClient, 'checkDatabase').mockResolvedValue(true);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ready',
      database: 'up',
    });
  });

  // T4: GET /health/ready com checagem falhando -> 503, database: 'down'
  it('T4: GET /health/ready returns status 503 with database: down when database check fails', async () => {
    vi.spyOn(dbClient, 'checkDatabase').mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  // T5: GET /docs/json -> 200, JSON com openapi e paths
  it('T5: GET /docs/json returns status 200 with openapi specification and paths', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(res.statusCode).toBe(200);
    const json = res.json<{
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    }>();

    expect(json).toHaveProperty('openapi');
    expect(json.openapi).toMatch(/^3\./);
    expect(json).toHaveProperty('paths');
    expect(json.paths).toHaveProperty('/health');
    expect(json.paths).toHaveProperty('/health/ready');
    expect(json.info.title).toBe('cardoso-sound-api');
  });

  // T6: Headers do helmet presentes -> x-content-type-options, x-frame-options
  it('T6: Helmet security headers are present on responses', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  // T7: Preflight OPTIONS em rota da API -> 204 com access-control-allow-*
  it('T7: Preflight OPTIONS request returns 204 with CORS access-control-allow-* headers', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  // T8: set-auth-token em access-control-expose-headers -> presente
  it('T8: set-auth-token is present in access-control-expose-headers', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    });

    const exposed = res.headers['access-control-expose-headers'];
    expect(exposed).toBeDefined();
    expect(exposed).toContain('set-auth-token');
  });
});
