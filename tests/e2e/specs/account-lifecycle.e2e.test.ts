import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../../src/db/client.js';
import {
  artists,
  favorites,
  playlistTracks,
  playlists,
  session,
  tracks,
  user,
} from '../../../src/db/schema/index.js';
import { seed } from '../../../src/db/seed/seed.js';
import { truncateAll } from '../../setup/testcontainers.js';
import { buildTestApp } from '../helpers/app.js';
import { signUpAndGetToken } from '../helpers/auth.js';

describe('E2E Account Lifecycle Flow (Account Deletion & Relational Cascade Expunge)', () => {
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

  // E8: DELETE /me -> playlists e favoritos do usuário somem
  it('E8: DELETE /api/v1/me expurga usuário, sessões, playlists e favoritos em cascata no PostgreSQL', async () => {
    const { token, userId } = await signUpAndGetToken(app, `user-${randomUUID()}@teste.local`);
    const authHeaders = { authorization: `Bearer ${token}` };

    // 1. Obtém 2 faixas do catálogo
    const tracksRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tracks?limit=2',
    });
    expect(tracksRes.statusCode).toBe(200);
    const catalogTracks = tracksRes.json<{ data: Array<{ id: string }> }>().data;
    expect(catalogTracks.length).toBe(2);
    const [track1, track2] = catalogTracks;
    expect(track1).toBeDefined();
    expect(track2).toBeDefined();
    if (!track1 || !track2) {
      throw new Error('Faixas de teste não encontradas');
    }
    const track1Id = track1.id;
    const track2Id = track2.id;

    // 2. Cria 2 playlists
    const p1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/playlists',
      headers: authHeaders,
      payload: { name: 'Playlist Um' },
    });
    expect(p1Res.statusCode).toBe(201);
    const p1Id = p1Res.json<{ id: string }>().id;

    const p2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/playlists',
      headers: authHeaders,
      payload: { name: 'Playlist Dois' },
    });
    expect(p2Res.statusCode).toBe(201);
    const p2Id = p2Res.json<{ id: string }>().id;

    // 3. Adiciona faixa à primeira playlist
    const addTrackRes = await app.inject({
      method: 'POST',
      url: `/api/v1/playlists/${p1Id}/tracks`,
      headers: authHeaders,
      payload: { trackId: track1Id },
    });
    expect(addTrackRes.statusCode).toBe(201);

    // 4. Favorita 2 faixas
    const fav1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/favorites/${track1Id}`,
      headers: authHeaders,
    });
    expect(fav1Res.statusCode).toBe(201);

    const fav2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/favorites/${track2Id}`,
      headers: authHeaders,
    });
    expect(fav2Res.statusCode).toBe(201);

    // 5. Confirma via HTTP que recursos existem
    const checkPlaylists = await app.inject({
      method: 'GET',
      url: '/api/v1/playlists',
      headers: authHeaders,
    });
    expect(checkPlaylists.json<{ meta: { total: number } }>().meta.total).toBe(2);

    const checkFavs = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: authHeaders,
    });
    expect(checkFavs.json<{ meta: { total: number } }>().meta.total).toBe(2);

    // 6. DELETE /api/v1/me -> 204 No Content
    const deleteMeRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: authHeaders,
    });
    expect(deleteMeRes.statusCode).toBe(204);

    // 7. Tentativa de acessar /me com o token revogado -> 401
    const meRevokedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeaders,
    });
    expect(meRevokedRes.statusCode).toBe(401);

    // 8. Inspeção direta das tabelas no PostgreSQL (comprova ON DELETE CASCADE físico)
    const userInDb = await db.select().from(user).where(eq(user.id, userId));
    expect(userInDb.length).toBe(0);

    const sessionsInDb = await db.select().from(session).where(eq(session.userId, userId));
    expect(sessionsInDb.length).toBe(0);

    const playlistsInDb = await db.select().from(playlists).where(eq(playlists.userId, userId));
    expect(playlistsInDb.length).toBe(0);

    const playlist1Tracks = await db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, p1Id));
    expect(playlist1Tracks.length).toBe(0);

    const playlist2Tracks = await db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, p2Id));
    expect(playlist2Tracks.length).toBe(0);

    const favoritesInDb = await db.select().from(favorites).where(eq(favorites.userId, userId));
    expect(favoritesInDb.length).toBe(0);

    // 9. Comprova que o catálogo público (artistas e faixas) permaneceu 100% íntegro
    const totalTracks = await db.select().from(tracks);
    expect(totalTracks.length).toBe(40);

    const totalArtists = await db.select().from(artists);
    expect(totalArtists.length).toBe(8);
  });
});
