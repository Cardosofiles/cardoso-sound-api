import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../../src/db/client.js';
import { seed } from '../../../src/db/seed/seed.js';
import { truncateAll } from '../../setup/testcontainers.js';
import { buildTestApp } from '../helpers/app.js';

describe('E2E Catalog Flow (Public Browsing, Tracks, Artists & Genres)', () => {
  let app: FastifyInstance;
  let db: Database;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const context = await buildTestApp();
    app = context.app;
    db = context.db;
    stop = context.stop;
  }, 120_000);

  afterAll(async () => {
    await stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(db);
    await seed(db);
  });

  // E3: GET /api/v1/tracks sem token -> 200 e catálogo populado
  it('E3: consulta pública sem token retorna catálogo populado com paginação e navegação', async () => {
    // 1. Consulta faixas sem nenhum token ou credencial
    const tracksRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tracks',
    });

    expect(tracksRes.statusCode).toBe(200);
    const tracksBody = tracksRes.json<{
      data: Array<{
        id: string;
        title: string;
        album: string | null;
        genre: string;
        durationSeconds: number;
        coverUrl: string | null;
        audioUrl: string;
        artist: { id: string; name: string; avatarUrl: string | null };
        createdAt: string;
      }>;
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>();

    expect(tracksBody.data).toBeInstanceOf(Array);
    expect(tracksBody.data.length).toBe(20);
    expect(tracksBody.meta).toEqual({
      page: 1,
      limit: 20,
      total: 40,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });

    const [firstTrack] = tracksBody.data;
    expect(firstTrack).toBeDefined();
    if (!firstTrack) {
      throw new Error('Primeira faixa não encontrada');
    }
    expect(firstTrack.id).toBeTruthy();
    expect(firstTrack.title).toBeTruthy();
    expect(firstTrack.genre).toBeTruthy();
    expect(firstTrack.durationSeconds).toBeGreaterThan(0);
    expect(firstTrack.artist.name).toBeTruthy();

    // 2. Consulta a segunda página
    const page2Res = await app.inject({
      method: 'GET',
      url: '/api/v1/tracks?page=2',
    });

    expect(page2Res.statusCode).toBe(200);
    const page2Body = page2Res.json<typeof tracksBody>();
    expect(page2Body.data.length).toBe(20);
    expect(page2Body.meta).toEqual({
      page: 2,
      limit: 20,
      total: 40,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });

    // 3. Consulta artistas sem token
    const artistsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/artists',
    });

    expect(artistsRes.statusCode).toBe(200);
    const artistsBody = artistsRes.json<{
      data: Array<{ id: string; name: string; trackCount: number }>;
      meta: { total: number };
    }>();
    expect(artistsBody.meta.total).toBe(8);
    expect(artistsBody.data.length).toBe(8);

    // 4. Consulta gêneros sem token
    const genresRes = await app.inject({
      method: 'GET',
      url: '/api/v1/genres',
    });

    expect(genresRes.statusCode).toBe(200);
    const genresBody = genresRes.json<{
      data: Array<{ genre: string; trackCount: number }>;
    }>();
    expect(genresBody.data.length).toBe(6);
    for (const item of genresBody.data) {
      expect(item.trackCount).toBeGreaterThanOrEqual(5);
    }
  });

  // E14: GET /api/v1/tracks devolve audioUrl de URL absoluta
  it('E14: todas as faixas do catálogo devolvem audioUrl com URL absoluta e válida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tracks?limit=40',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      data: Array<{
        id: string;
        audioUrl: string;
      }>;
    }>();

    expect(body.data.length).toBe(40);
    for (const track of body.data) {
      expect(track.audioUrl).toMatch(/^https?:\/\/.+/);
      expect(track.audioUrl).toContain('SoundHelix');
    }
  });
});
