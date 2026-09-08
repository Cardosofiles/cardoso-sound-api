import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../../src/db/client.js';
import { seed } from '../../../src/db/seed/seed.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { truncateAll } from '../../setup/testcontainers.js';
import { buildTestApp } from '../helpers/app.js';
import { signUpAndGetToken } from '../helpers/auth.js';

describe('E2E Favorites Flow (Favorite, Listing, Duplicate Handling & Unfavorite)', () => {
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

  // E5: favoritar -> GET /favorites contém -> desfavoritar -> 204 -> vazia
  it('E5: favorita faixa, lista favoritos, rejeita duplicata com 409, desfavorita e esvazia listagem', async () => {
    const { token } = await signUpAndGetToken(app, `user-${randomUUID()}@teste.local`);
    const authHeaders = { authorization: `Bearer ${token}` };

    // 1. Obtém uma faixa existente do catálogo
    const tracksRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tracks?limit=1',
    });
    expect(tracksRes.statusCode).toBe(200);
    const [track] = tracksRes.json<{ data: Array<{ id: string; title: string }> }>().data;
    expect(track).toBeDefined();
    if (!track) {
      throw new Error('Faixa do catálogo não encontrada');
    }
    const trackId = track.id;

    // 2. Confirma favoritos inicialmente vazios
    const initialFavsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: authHeaders,
    });
    expect(initialFavsRes.statusCode).toBe(200);
    expect(initialFavsRes.json<{ data: unknown[]; meta: { total: number } }>().meta.total).toBe(0);

    // 3. Favorita a faixa
    const addFavRes = await app.inject({
      method: 'POST',
      url: `/api/v1/favorites/${trackId}`,
      headers: authHeaders,
    });

    expect(addFavRes.statusCode).toBe(201);
    const favoriteItem = addFavRes.json<{
      id: string;
      title: string;
      favoritedAt: string;
      artist: { id: string; name: string };
    }>();
    expect(favoriteItem.id).toBe(trackId);
    expect(favoriteItem.title).toBe(track.title);
    expect(favoriteItem.favoritedAt).toBeTruthy();

    // 4. Tentativa de favoritar novamente a mesma faixa -> 409 Conflict
    const duplicateFavRes = await app.inject({
      method: 'POST',
      url: `/api/v1/favorites/${trackId}`,
      headers: authHeaders,
    });
    expect(duplicateFavRes.statusCode).toBe(409);
    const conflictBody = duplicateFavRes.json<ErrorResponseEnvelope>();
    expect(conflictBody.statusCode).toBe(409);
    expect(conflictBody.error).toBe('Conflict');
    expect(typeof conflictBody.message).toBe('string');
    expect(conflictBody.details).toBeNull();

    // 5. GET /api/v1/favorites lista a faixa favoritada
    const listFavsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: authHeaders,
    });

    expect(listFavsRes.statusCode).toBe(200);
    const listBody = listFavsRes.json<{
      data: Array<{ id: string; favoritedAt: string }>;
      meta: { total: number };
    }>();
    expect(listBody.meta.total).toBe(1);
    expect(listBody.data.length).toBe(1);
    const [firstFav] = listBody.data;
    expect(firstFav).toBeDefined();
    if (!firstFav) {
      throw new Error('Favorito não encontrado');
    }
    expect(firstFav.id).toBe(trackId);

    // 6. Desfavorita a faixa
    const deleteFavRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/favorites/${trackId}`,
      headers: authHeaders,
    });
    expect(deleteFavRes.statusCode).toBe(204);

    // 7. GET /api/v1/favorites volta a ser vazia
    const emptyFavsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: authHeaders,
    });
    expect(emptyFavsRes.statusCode).toBe(200);
    const emptyBody = emptyFavsRes.json<{
      data: unknown[];
      meta: { total: number };
    }>();
    expect(emptyBody.meta.total).toBe(0);
    expect(emptyBody.data.length).toBe(0);

    // 8. Tentar desfavoritar novamente -> 404 Not Found
    const repeatDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/favorites/${trackId}`,
      headers: authHeaders,
    });
    expect(repeatDeleteRes.statusCode).toBe(404);
  });

  it('Isolamento: Usuário B não acessa nem remove favoritos do Usuário A', async () => {
    const userA = await signUpAndGetToken(app, `user-a-${randomUUID()}@teste.local`);
    const userB = await signUpAndGetToken(app, `user-b-${randomUUID()}@teste.local`);

    // Obtém faixa
    const tracksRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tracks?limit=1',
    });
    const [firstTrack] = tracksRes.json<{ data: Array<{ id: string }> }>().data;
    expect(firstTrack).toBeDefined();
    if (!firstTrack) {
      throw new Error('Faixa não encontrada');
    }
    const trackId = firstTrack.id;

    // Usuário A favorita
    await app.inject({
      method: 'POST',
      url: `/api/v1/favorites/${trackId}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    // Usuário B consulta seus favoritos -> vazio
    const userBFavs = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(userBFavs.json<{ meta: { total: number } }>().meta.total).toBe(0);

    // Usuário B tenta remover o favorito de A -> 404 (D-31: nunca 403)
    const userBDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/favorites/${trackId}`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(userBDelete.statusCode).toBe(404);
  });
});
