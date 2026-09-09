import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateOpenApiSpec } from '../../scripts/export-openapi.js';
import { buildApp } from '../../src/app.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const EXPECTED_PATHS = [
  '/health',
  '/health/ready',
  '/api/v1/artists',
  '/api/v1/artists/{id}',
  '/api/v1/tracks',
  '/api/v1/tracks/{id}',
  '/api/v1/genres',
  '/api/v1/me',
  '/api/v1/playlists',
  '/api/v1/playlists/{id}',
  '/api/v1/playlists/{id}/tracks',
  '/api/v1/playlists/{id}/tracks/{trackId}',
  '/api/v1/favorites',
  '/api/v1/favorites/{trackId}',
];

const VALID_TAGS = ['Health', 'Auth', 'Catalog', 'Profile', 'Library'];

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  responses?: Record<string, unknown>;
}

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, { type: string; scheme?: string; in?: string; name?: string }>;
    schemas?: Record<string, unknown>;
  };
}

describe('OpenAPI Contract and Documentation Integration Tests (T1–T12)', () => {
  let app: FastifyInstance;
  let spec: OpenApiSpec;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    spec = app.swagger() as OpenApiSpec;
  });

  afterAll(async () => {
    await app.close();
  });

  // T1: app.swagger() gera spec válido (tem openapi, info, paths)
  it('T1: app.swagger() generates valid OpenAPI specification', () => {
    expect(spec).toBeDefined();
    expect(typeof spec.openapi).toBe('string');
    expect(spec.openapi).toMatch(/^3\.[01]\.\d+$/);
    expect(spec.info).toBeDefined();
    expect(typeof spec.info.title).toBe('string');
    expect(typeof spec.info.version).toBe('string');
    expect(spec.paths).toBeDefined();
    expect(typeof spec.paths).toBe('object');
  });

  // T2: Todas as rotas da spec 03 §2 aparecem (comparar chaves de paths com lista literal)
  it('T2: all documented route paths match the expected literal list', () => {
    const actualPaths = Object.keys(spec.paths).sort();
    const expectedSorted = [...EXPECTED_PATHS].sort();
    expect(actualPaths).toEqual(expectedSorted);
  });

  // T3: Toda operação tem operationId não-vazio
  it('T3: every operation has a non-empty operationId', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(
          typeof op.operationId,
          `Expected operationId on ${method.toUpperCase()} ${path}`,
        ).toBe('string');
        expect(
          op.operationId?.trim().length,
          `Empty operationId on ${method.toUpperCase()} ${path}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  // T4: operationId são únicos (new Set(ids).size === ids.length)
  it('T4: all operationIds are strictly unique', () => {
    const operationIds: string[] = [];
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) {
        if (op.operationId) {
          operationIds.push(op.operationId);
        }
      }
    }
    expect(operationIds.length).toBe(20);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  // T5: Toda operação tem ao menos um tag
  it('T5: every operation has at least one valid tag', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(
          Array.isArray(op.tags),
          `Expected tags array on ${method.toUpperCase()} ${path}`,
        ).toBe(true);
        expect(
          op.tags?.length,
          `Expected at least one tag on ${method.toUpperCase()} ${path}`,
        ).toBeGreaterThanOrEqual(1);

        for (const tag of op.tags ?? []) {
          expect(VALID_TAGS, `Unknown tag "${tag}" on ${method.toUpperCase()} ${path}`).toContain(
            tag,
          );
        }
      }
    }
  });

  // T6: Rotas protegidas têm security (as 13 rotas de Profile + Library)
  it('T6: protected routes have security requirement configured', () => {
    const protectedOperations: Array<{ path: string; method: string }> = [
      { path: '/api/v1/me', method: 'get' },
      { path: '/api/v1/me', method: 'patch' },
      { path: '/api/v1/me', method: 'delete' },
      { path: '/api/v1/playlists', method: 'get' },
      { path: '/api/v1/playlists', method: 'post' },
      { path: '/api/v1/playlists/{id}', method: 'get' },
      { path: '/api/v1/playlists/{id}', method: 'patch' },
      { path: '/api/v1/playlists/{id}', method: 'delete' },
      { path: '/api/v1/playlists/{id}/tracks', method: 'post' },
      { path: '/api/v1/playlists/{id}/tracks/{trackId}', method: 'delete' },
      { path: '/api/v1/favorites', method: 'get' },
      { path: '/api/v1/favorites/{trackId}', method: 'post' },
      { path: '/api/v1/favorites/{trackId}', method: 'delete' },
    ];

    expect(protectedOperations.length).toBe(13);

    for (const { path, method } of protectedOperations) {
      const op = spec.paths[path]?.[method];
      expect(op, `Missing route ${method.toUpperCase()} ${path}`).toBeDefined();
      if (!op) continue;

      expect(
        Array.isArray(op.security),
        `Route ${method.toUpperCase()} ${path} must declare security`,
      ).toBe(true);
      expect(op.security).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bearerAuth: [] }),
          expect.objectContaining({ cookieAuth: [] }),
        ]),
      );
    }
  });

  // T7: Rotas públicas NÃO têm security (catálogo e health)
  it('T7: public routes do not declare security', () => {
    const publicOperations: Array<{ path: string; method: string }> = [
      { path: '/health', method: 'get' },
      { path: '/health/ready', method: 'get' },
      { path: '/api/v1/artists', method: 'get' },
      { path: '/api/v1/artists/{id}', method: 'get' },
      { path: '/api/v1/tracks', method: 'get' },
      { path: '/api/v1/tracks/{id}', method: 'get' },
      { path: '/api/v1/genres', method: 'get' },
    ];

    expect(publicOperations.length).toBe(7);

    for (const { path, method } of publicOperations) {
      const op = spec.paths[path]?.[method];
      expect(op, `Missing route ${method.toUpperCase()} ${path}`).toBeDefined();
      if (!op) continue;

      expect(
        op.security,
        `Public route ${method.toUpperCase()} ${path} should not have security`,
      ).toBeUndefined();
    }
  });

  // T8: securitySchemes tem bearerAuth e cookieAuth
  it('T8: securitySchemes defines bearerAuth and cookieAuth', () => {
    const schemes = spec.components?.securitySchemes;
    expect(schemes).toBeDefined();
    if (!schemes) return;

    expect(schemes.bearerAuth).toBeDefined();
    expect(schemes.bearerAuth?.type).toBe('http');
    expect(schemes.bearerAuth?.scheme).toBe('bearer');
    expect(schemes.cookieAuth).toBeDefined();
    expect(schemes.cookieAuth?.type).toBe('apiKey');
    expect(schemes.cookieAuth?.in).toBe('cookie');
    expect(schemes.cookieAuth?.name).toBe('better-auth.session_token');
  });

  // T9: Export rodado 2× produz bytes idênticos (determinismo)
  it('T9: export executed twice produces strictly identical bytes', async () => {
    const run1 = await generateOpenApiSpec();
    const run2 = await generateOpenApiSpec();
    expect(run1).toBe(run2);
  });

  // T10: docs/openapi.json commitado bate com o gerado (é o próprio --check)
  it('T10: committed docs/openapi.json matches generated specification', async () => {
    const targetPath = resolve(process.cwd(), 'docs/openapi.json');
    const diskContent = await readFile(targetPath, 'utf8');
    const generatedContent = await generateOpenApiSpec();
    expect(diskContent).toBe(generatedContent);
  });

  // T11: info.version igual ao package.json
  it('T11: info.version strictly matches package.json version', () => {
    expect(spec.info.version).toBe(pkg.version);
  });

  // T12: Nenhum schema com additionalProperties: true em response (prova a poda do serializer)
  it('T12: no response schema has additionalProperties: true', () => {
    function assertNoAdditionalProperties(obj: unknown, breadcrumb = ''): void {
      if (!obj || typeof obj !== 'object') return;

      const record = obj as Record<string, unknown>;
      if (record.additionalProperties === true) {
        throw new Error(`Found additionalProperties: true at response schema node: ${breadcrumb}`);
      }

      for (const [key, val] of Object.entries(record)) {
        assertNoAdditionalProperties(val, breadcrumb ? `${breadcrumb}.${key}` : key);
      }
    }

    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (op.responses) {
          assertNoAdditionalProperties(op.responses, `paths.${path}.${method}.responses`);
        }
      }
    }

    if (spec.components?.schemas) {
      assertNoAdditionalProperties(spec.components.schemas, 'components.schemas');
    }
  });
});
