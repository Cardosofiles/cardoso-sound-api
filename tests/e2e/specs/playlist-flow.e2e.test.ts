import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../../src/db/client.js';
import { seed } from '../../../src/db/seed/seed.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { truncateAll } from '../../setup/testcontainers.js';
import { buildTestApp } from '../helpers/app.js';
import { signUpAndGetToken } from '../helpers/auth.js';

describe('E2E Playlist Flow (Creation, Tracks Management & Privacy Isolation)', () => {
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

  // E4: criar playlist -> adicionar faixa -> GET /playlists/:id mostra -> remover -> vazia
  it('E4: cria playlist, adiciona faixa, consulta detalhe, remove faixa e esvazia playlist', async () => {
    const { token } = await signUpAndGetToken(app, `user-${randomUUID()}@teste.local`);
    const authHeaders = { authorization: `Bearer ${token}` };

    // 1. Cria playlist
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/playlists',
      headers: authHeaders,
      payload: {
        name: 'Treino Pesado',
        description: 'Músicas para academia',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdPlaylist = createRes.json<{
      id: string;
      name: string;
      description: string | null;
      trackCount: number;
    }>();
    expect(createdPlaylist.name).toBe('Treino Pesado');
    expect(createdPlaylist.trackCount).toBe(0);
    const playlistId = createdPlaylist.id;

    // 2. Obtém uma faixa existente do catálogo
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

    // 3. Adiciona faixa à playlist
    const addTrackRes = await app.inject({
      method: 'POST',
      url: `/api/v1/playlists/${playlistId}/tracks`,
      headers: authHeaders,
      payload: { trackId },
    });

    expect(addTrackRes.statusCode).toBe(201);
    const detailAfterAdd = addTrackRes.json<{
      id: string;
      name: string;
      trackCount: number;
      tracks: Array<{ id: string; title: string; addedAt: string }>;
    }>();
    expect(detailAfterAdd.trackCount).toBe(1);
    expect(detailAfterAdd.tracks.length).toBe(1);
    const [addedTrack] = detailAfterAdd.tracks;
    expect(addedTrack).toBeDefined();
    if (!addedTrack) {
      throw new Error('Faixa inserida não encontrada no retorno');
    }
    expect(addedTrack.id).toBe(trackId);

    // 4. GET /playlists/:id confirma a faixa presente
    const getDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/playlists/${playlistId}`,
      headers: authHeaders,
    });

    expect(getDetailRes.statusCode).toBe(200);
    const detailBody = getDetailRes.json<typeof detailAfterAdd>();
    expect(detailBody.trackCount).toBe(1);
    const [firstDetailTrack] = detailBody.tracks;
    expect(firstDetailTrack).toBeDefined();
    if (!firstDetailTrack) {
      throw new Error('Faixa não encontrada no detalhe da playlist');
    }
    expect(firstDetailTrack.id).toBe(trackId);

    // 5. Remove a faixa da playlist
    const removeTrackRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/playlists/${playlistId}/tracks/${trackId}`,
      headers: authHeaders,
    });

    expect(removeTrackRes.statusCode).toBe(204);

    // 6. GET /playlists/:id confirma que a lista de faixas agora está vazia
    const getAfterRemoveRes = await app.inject({
      method: 'GET',
      url: `/api/v1/playlists/${playlistId}`,
      headers: authHeaders,
    });

    expect(getAfterRemoveRes.statusCode).toBe(200);
    const emptyDetail = getAfterRemoveRes.json<typeof detailAfterAdd>();
    expect(emptyDetail.trackCount).toBe(0);
    expect(emptyDetail.tracks.length).toBe(0);

    // 7. Exclui a playlist
    const deletePlaylistRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/playlists/${playlistId}`,
      headers: authHeaders,
    });
    expect(deletePlaylistRes.statusCode).toBe(204);

    // 8. GET /playlists/:id agora responde 404
    const getDeletedRes = await app.inject({
      method: 'GET',
      url: `/api/v1/playlists/${playlistId}`,
      headers: authHeaders,
    });
    expect(getDeletedRes.statusCode).toBe(404);
  });

  // E6: A cria playlist; B faz GET nela -> 404
  it('E6: Usuário A cria playlist privada; Usuário B faz GET nela -> responde 404 Not Found (nunca 403)', async () => {
    const userA = await signUpAndGetToken(app, `user-a-${randomUUID()}@teste.local`);
    const userB = await signUpAndGetToken(app, `user-b-${randomUUID()}@teste.local`);

    // Usuário A cria playlist privada
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/playlists',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        name: 'Segredo do Usuário A',
        description: 'Ninguém mais pode ver',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const playlistId = createRes.json<{ id: string }>().id;

    // Usuário B tenta consultar a playlist de A
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/playlists/${playlistId}`,
      headers: { authorization: `Bearer ${userB.token}` },
    });

    // D-31 e Spec 03 §7: Recurso alheio responde 404, nunca 403
    expect(getRes.statusCode).toBe(404);
    const errorBody = getRes.json<ErrorResponseEnvelope>();
    expect(errorBody.statusCode).toBe(404);
    expect(errorBody.error).toBe('Not Found');
    expect(typeof errorBody.message).toBe('string');
    expect(errorBody.details).toBeNull();

    // Usuário B tenta alterar a playlist de A -> 404
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/playlists/${playlistId}`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: { name: 'Tentativa de Hack' },
    });
    expect(patchRes.statusCode).toBe(404);

    // Usuário B tenta deletar a playlist de A -> 404
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/playlists/${playlistId}`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(deleteRes.statusCode).toBe(404);
  });
});
