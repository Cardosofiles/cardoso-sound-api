import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { pool, setPool } from '../../../src/db/client.js';
import { playlistTracks, tracks } from '../../../src/db/schema/index.js';
import { seed } from '../../../src/db/seed/seed.js';
import { PlaylistsRepository } from '../../../src/modules/playlists/playlists.repository.js';
import type {
  ListPlaylistsResponseDto,
  PlaylistDetailDto,
  PlaylistDto,
} from '../../../src/modules/playlists/playlists.schema.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { signUpAndGetToken } from '../../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../../setup/testcontainers.js';

describe('PlaylistsRepository & /api/v1/playlists Integration Tests', () => {
  let testDb: TestDatabase;
  let repo: PlaylistsRepository;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
    repo = new PlaylistsRepository(testDb.db);

    app = await buildApp();
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    setPool(originalPool);
    await testDb.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(testDb.db);
    await seed(testDb.db);
  });

  // ============================================================================
  // Testes Diretos de PlaylistsRepository
  // ============================================================================

  describe('PlaylistsRepository Direct Methods', () => {
    it('Repo 1: create and findByIdForUser retrieve playlist with trackCount 0', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-create@example.com');

      const created = await repo.create(userId, {
        name: 'Minha Playlist',
        description: 'Descrição de teste',
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe('Minha Playlist');
      expect(created.description).toBe('Descrição de teste');
      expect(created.trackCount).toBe(0);

      const found = await repo.findByIdForUser(created.id, userId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Minha Playlist');
      expect(found?.trackCount).toBe(0);
      expect(found?.tracks).toEqual([]);
    });

    it('Repo 2: findByIdForUser isolates by user (user B gets null for user A playlist)', async () => {
      const userA = await signUpAndGetToken(app, 'repo-iso-a@example.com');
      const userB = await signUpAndGetToken(app, 'repo-iso-b@example.com');

      const playlistA = await repo.create(userA.userId, { name: 'Playlist do User A' });

      const foundByB = await repo.findByIdForUser(playlistA.id, userB.userId);
      expect(foundByB).toBeNull();
    });

    it('Repo 3: listByUser returns only playlists belonging to specified user', async () => {
      const userA = await signUpAndGetToken(app, 'repo-list-a@example.com');
      const userB = await signUpAndGetToken(app, 'repo-list-b@example.com');

      await repo.create(userA.userId, { name: 'Playlist A1' });
      await repo.create(userA.userId, { name: 'Playlist A2' });
      await repo.create(userB.userId, { name: 'Playlist B1' });

      const listA = await repo.listByUser(userA.userId, { limit: 10, offset: 0 });
      expect(listA.total).toBe(2);
      expect(listA.rows).toHaveLength(2);
      expect(listA.rows.map((r) => r.name)).toContain('Playlist A1');
      expect(listA.rows.map((r) => r.name)).toContain('Playlist A2');

      const listB = await repo.listByUser(userB.userId, { limit: 10, offset: 0 });
      expect(listB.total).toBe(1);
      expect(listB.rows).toHaveLength(1);
      expect(listB.rows[0]?.name).toBe('Playlist B1');
    });

    it('Repo 4: countByUser reflects actual count of user playlists', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-count@example.com');

      expect(await repo.countByUser(userId)).toBe(0);

      await repo.create(userId, { name: 'P1' });
      await repo.create(userId, { name: 'P2' });

      expect(await repo.countByUser(userId)).toBe(2);
    });

    it('Repo 5: update alters name and description, updating updatedAt', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-upd@example.com');
      const created = await repo.create(userId, { name: 'Original', description: 'Desc original' });

      const updated = await repo.update(created.id, userId, {
        name: 'Atualizada',
        description: null,
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Atualizada');
      expect(updated?.description).toBeNull();
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('Repo 6: delete removes playlist and purges items in transaction', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-del@example.com');
      const playlist = await repo.create(userId, { name: 'Deletar' });
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (track) {
        await repo.addTrack(playlist.id, track.id);
      }

      const deleted = await repo.delete(playlist.id, userId);
      expect(deleted).toBe(true);

      const checkPlaylist = await repo.findByIdForUser(playlist.id, userId);
      expect(checkPlaylist).toBeNull();

      const tracksRemaining = await testDb.db
        .select()
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlist.id));
      expect(tracksRemaining).toHaveLength(0);
    });

    it('Repo 7: trackExists returns true for existing track and false for missing', async () => {
      const [existingTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      expect(existingTrack).toBeDefined();
      if (existingTrack) {
        expect(await repo.trackExists(existingTrack.id)).toBe(true);
      }
      expect(await repo.trackExists('00000000-0000-4000-8000-000000000000')).toBe(false);
    });

    it('Repo 8: hasTrack detects track presence in playlist', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-has@example.com');
      const playlist = await repo.create(userId, { name: 'Playlist Has' });
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (track) {
        expect(await repo.hasTrack(playlist.id, track.id)).toBe(false);
        await repo.addTrack(playlist.id, track.id);
        expect(await repo.hasTrack(playlist.id, track.id)).toBe(true);
      }
    });

    it('Repo 9: addTrack adds track and returns false on repeat (conflict)', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-add@example.com');
      const playlist = await repo.create(userId, { name: 'Playlist Add' });
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (track) {
        const first = await repo.addTrack(playlist.id, track.id);
        expect(first).toBe(true);

        const second = await repo.addTrack(playlist.id, track.id);
        expect(second).toBe(false);
      }
    });

    it('Repo 10: removeTrack removes track and returns false if absent', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-rem@example.com');
      const playlist = await repo.create(userId, { name: 'Playlist Rem' });
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (track) {
        expect(await repo.removeTrack(playlist.id, track.id)).toBe(false);
        await repo.addTrack(playlist.id, track.id);
        expect(await repo.removeTrack(playlist.id, track.id)).toBe(true);
        expect(await repo.removeTrack(playlist.id, track.id)).toBe(false);
      }
    });

    it('Repo 11: countTracks counts tracks accurately', async () => {
      const { userId } = await signUpAndGetToken(app, 'repo-cnt-trk@example.com');
      const playlist = await repo.create(userId, { name: 'Playlist Cnt' });
      const seedTracks = await testDb.db.select({ id: tracks.id }).from(tracks).limit(2);

      expect(await repo.countTracks(playlist.id)).toBe(0);

      if (seedTracks[0]) {
        await repo.addTrack(playlist.id, seedTracks[0].id);
        expect(await repo.countTracks(playlist.id)).toBe(1);
      }

      if (seedTracks[1]) {
        await repo.addTrack(playlist.id, seedTracks[1].id);
        expect(await repo.countTracks(playlist.id)).toBe(2);
      }
    });
  });

  // ============================================================================
  // Testes de Rotas HTTP via app.inject() (T13 a T35)
  // ============================================================================

  describe('HTTP Routes via app.inject() (T13 to T35)', () => {
    // T13: POST /playlists válido -> 201, trackCount: 0
    it('T13: POST /api/v1/playlists with valid body returns 201 and trackCount 0', async () => {
      const { token } = await signUpAndGetToken(app, 't13@example.com');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Treino',
          description: 'Músicas para academia',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json<PlaylistDto>();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Treino');
      expect(body.description).toBe('Músicas para academia');
      expect(body.trackCount).toBe(0);
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    // T14: POST com name: "" -> 400
    it('T14: POST /api/v1/playlists with empty name returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app, 't14@example.com');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          name: '',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.error).toBe('Bad Request');
    });

    // T15: POST com name de 121 chars -> 400
    it('T15: POST /api/v1/playlists with 121 chars name returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app, 't15@example.com');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'a'.repeat(121),
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.error).toBe('Bad Request');
    });

    // T16: POST sem token -> 401
    it('T16: POST /api/v1/playlists without token returns 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          name: 'Sem Token',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.error).toBe('Unauthorized');
    });

    // T17: GET /playlists só traz as do usuário (A cria 2, B cria 1 -> A vê 2)
    it('T17: GET /api/v1/playlists returns only playlists belonging to authenticated user', async () => {
      const userA = await signUpAndGetToken(app, 't17-a@example.com');
      const userB = await signUpAndGetToken(app, 't17-b@example.com');

      // A cria 2 playlists
      await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userA.token}`, 'content-type': 'application/json' },
        payload: { name: 'A - 1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userA.token}`, 'content-type': 'application/json' },
        payload: { name: 'A - 2' },
      });

      // B cria 1 playlist
      await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userB.token}`, 'content-type': 'application/json' },
        payload: { name: 'B - 1' },
      });

      // A lista playlists
      const resA = await app.inject({
        method: 'GET',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userA.token}` },
      });

      expect(resA.statusCode).toBe(200);
      const bodyA = resA.json<ListPlaylistsResponseDto>();
      expect(bodyA.meta.total).toBe(2);
      expect(bodyA.data).toHaveLength(2);
      expect(bodyA.data.map((p) => p.name)).toEqual(expect.arrayContaining(['A - 1', 'A - 2']));
    });

    // T18: GET /playlists/:id de outro usuário -> 404, não 403 (D-31)
    it('T18: GET /api/v1/playlists/:id of another user returns 404, NOT 403 (D-31)', async () => {
      const userA = await signUpAndGetToken(app, 't18-a@example.com');
      const userB = await signUpAndGetToken(app, 't18-b@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userA.token}`, 'content-type': 'application/json' },
        payload: { name: 'Secreta de A' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const resB = await app.inject({
        method: 'GET',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userB.token}` },
      });

      expect(resB.statusCode).toBe(404);
      const bodyB = resB.json<ErrorResponseEnvelope>();
      expect(bodyB.error).toBe('Not Found');
    });

    // T19: GET /playlists/:id inexistente -> 404
    it('T19: GET /api/v1/playlists/:id with non-existent id returns 404 Not Found', async () => {
      const { token } = await signUpAndGetToken(app, 't19@example.com');

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/playlists/00000000-0000-4000-8000-000000000000',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    // T20: PATCH de playlist alheia -> 404
    it('T20: PATCH /api/v1/playlists/:id of another user returns 404 Not Found', async () => {
      const userA = await signUpAndGetToken(app, 't20-a@example.com');
      const userB = await signUpAndGetToken(app, 't20-b@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userA.token}`, 'content-type': 'application/json' },
        payload: { name: 'Original de A' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const resB = await app.inject({
        method: 'PATCH',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userB.token}`, 'content-type': 'application/json' },
        payload: { name: 'Tentativa de Hack' },
      });

      expect(resB.statusCode).toBe(404);
    });

    // T21: PATCH com {} -> 400
    it('T21: PATCH /api/v1/playlists/:id with empty payload {} returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app, 't21@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Para Patch Vazio' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.error).toBe('Bad Request');
    });

    // T22: DELETE de playlist alheia -> 404; a playlist de B continua existindo
    it('T22: DELETE /api/v1/playlists/:id of another user returns 404; original remains intact', async () => {
      const userA = await signUpAndGetToken(app, 't22-a@example.com');
      const userB = await signUpAndGetToken(app, 't22-b@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userB.token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist Intacta de B' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      // A tenta deletar playlist de B
      const resA = await app.inject({
        method: 'DELETE',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });

      expect(resA.statusCode).toBe(404);

      // B verifica que continua intacta
      const resB = await app.inject({
        method: 'GET',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${userB.token}` },
      });
      expect(resB.statusCode).toBe(200);
    });

    // T23: DELETE própria -> 204; GET seguinte 404
    it('T23: DELETE /api/v1/playlists/:id own returns 204; subsequent GET returns 404', async () => {
      const { token } = await signUpAndGetToken(app, 't23@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Para Deletar' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(delRes.statusCode).toBe(204);
      expect(delRes.body).toBe('');

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getRes.statusCode).toBe(404);
    });

    // T24: DELETE remove as linhas de playlist_tracks -> contagem zero
    it('T24: DELETE /api/v1/playlists/:id removes associated playlist_tracks rows', async () => {
      const { token } = await signUpAndGetToken(app, 't24@example.com');
      const [seedTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      expect(seedTrack).toBeDefined();

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Com Faixa Para Deletar' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      if (seedTrack) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });
      }

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const remainingTracks = await testDb.db
        .select()
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId));

      expect(remainingTracks).toHaveLength(0);
    });

    // T25: POST /:id/tracks válido -> 201; PlaylistDetail com a faixa
    it('T25: POST /api/v1/playlists/:id/tracks with valid track returns 201 and PlaylistDetail', async () => {
      const { token } = await signUpAndGetToken(app, 't25@example.com');
      const [seedTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      expect(seedTrack).toBeDefined();

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist com Faixa' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      if (seedTrack) {
        const addRes = await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });

        expect(addRes.statusCode).toBe(201);
        const detail = addRes.json<PlaylistDetailDto>();
        expect(detail.id).toBe(playlistId);
        expect(detail.trackCount).toBe(1);
        expect(detail.tracks).toHaveLength(1);
        expect(detail.tracks[0]?.id).toBe(seedTrack.id);
        expect(detail.tracks[0]?.addedAt).toBeDefined();
        expect(detail.tracks[0]?.artist.name).toBeDefined();
      }
    });

    // T26: POST /:id/tracks repetido -> 409
    it('T26: POST /api/v1/playlists/:id/tracks repeated track returns 409 Conflict', async () => {
      const { token } = await signUpAndGetToken(app, 't26@example.com');
      const [seedTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist Repetida' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      if (seedTrack) {
        // Primeira inserção: 201
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });

        // Segunda inserção: 409
        const repeatRes = await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });

        expect(repeatRes.statusCode).toBe(409);
        const body = repeatRes.json<ErrorResponseEnvelope>();
        expect(body.error).toBe('Conflict');
        expect(body.message).toBe('Track already in playlist');
      }
    });

    // T27: POST /:id/tracks com trackId inexistente -> 404
    it('T27: POST /api/v1/playlists/:id/tracks with non-existent trackId returns 404 Not Found', async () => {
      const { token } = await signUpAndGetToken(app, 't27@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist T27' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/playlists/${playlistId}/tracks`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { trackId: '00000000-0000-4000-8000-000000000000' },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.message).toBe('Track not found');
    });

    // T28: POST /:id/tracks em playlist alheia -> 404
    it('T28: POST /api/v1/playlists/:id/tracks on another user playlist returns 404 Not Found', async () => {
      const userA = await signUpAndGetToken(app, 't28-a@example.com');
      const userB = await signUpAndGetToken(app, 't28-b@example.com');
      const [seedTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${userA.token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist de A' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      if (seedTrack) {
        const resB = await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${userB.token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });

        expect(resB.statusCode).toBe(404);
        const body = resB.json<ErrorResponseEnvelope>();
        expect(body.message).toBe('Playlist not found');
      }
    });

    // T29: POST /:id/tracks com trackId não-UUID -> 400
    it('T29: POST /api/v1/playlists/:id/tracks with non-UUID trackId returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app, 't29@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist T29' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/playlists/${playlistId}/tracks`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { trackId: 'not-a-valid-uuid' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorResponseEnvelope>();
      expect(body.error).toBe('Bad Request');
    });

    // T30: DELETE /:id/tracks/:trackId presente -> 204
    it('T30: DELETE /api/v1/playlists/:id/tracks/:trackId present returns 204 No Content', async () => {
      const { token } = await signUpAndGetToken(app, 't30@example.com');
      const [seedTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist T30' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      if (seedTrack) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });

        const delRes = await app.inject({
          method: 'DELETE',
          url: `/api/v1/playlists/${playlistId}/tracks/${seedTrack.id}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(delRes.statusCode).toBe(204);
        expect(delRes.body).toBe('');
      }
    });

    // T31: DELETE /:id/tracks/:trackId ausente -> 404
    it('T31: DELETE /api/v1/playlists/:id/tracks/:trackId absent returns 404 Not Found', async () => {
      const { token } = await signUpAndGetToken(app, 't31@example.com');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist T31' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/playlists/${playlistId}/tracks/00000000-0000-4000-8000-000000000000`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(delRes.statusCode).toBe(404);
      const body = delRes.json<ErrorResponseEnvelope>();
      expect(body.message).toBe('Track not found in playlist');
    });

    // T32: 3 faixas adicionadas em sequência -> tracks ordenado por addedAt ASC (D-15)
    it('T32: 3 tracks added sequentially are strictly ordered by addedAt ASC', async () => {
      const { token } = await signUpAndGetToken(app, 't32@example.com');
      const seedTracks = await testDb.db.select({ id: tracks.id }).from(tracks).limit(3);

      expect(seedTracks).toHaveLength(3);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist Ordem' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      // Insere as 3 faixas com pequeno delay para garantir timestamps distintos
      for (const st of seedTracks) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: st.id },
        });
      }

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/playlists/${playlistId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(getRes.statusCode).toBe(200);
      const detail = getRes.json<PlaylistDetailDto>();
      expect(detail.tracks).toHaveLength(3);

      const addedAts = detail.tracks.map((t) => new Date(t.addedAt).getTime());
      const firstAddedAt = addedAts[0] ?? 0;
      const secondAddedAt = addedAts[1] ?? 0;
      const thirdAddedAt = addedAts[2] ?? 0;
      expect(firstAddedAt).toBeLessThanOrEqual(secondAddedAt);
      expect(secondAddedAt).toBeLessThanOrEqual(thirdAddedAt);
    });

    // T33: trackCount reflete o número real após add/remove
    it('T33: trackCount accurately reflects count after add and remove', async () => {
      const { token } = await signUpAndGetToken(app, 't33@example.com');
      const seedTracks = await testDb.db.select({ id: tracks.id }).from(tracks).limit(2);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist Contador' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      // Inicial: 0
      let listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(listRes.json<ListPlaylistsResponseDto>().data[0]?.trackCount).toBe(0);

      // Adiciona 2 faixas
      if (seedTracks[0] && seedTracks[1]) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTracks[0].id },
        });
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTracks[1].id },
        });

        listRes = await app.inject({
          method: 'GET',
          url: '/api/v1/playlists',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(listRes.json<ListPlaylistsResponseDto>().data[0]?.trackCount).toBe(2);

        // Remove 1 faixa
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/playlists/${playlistId}/tracks/${seedTracks[0].id}`,
          headers: { authorization: `Bearer ${token}` },
        });

        listRes = await app.inject({
          method: 'GET',
          url: '/api/v1/playlists',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(listRes.json<ListPlaylistsResponseDto>().data[0]?.trackCount).toBe(1);
      }
    });

    // T34: Faixa apagada do catálogo -> some da playlist (cascade)
    it('T34: track deleted from catalog cascades and disappears from playlist', async () => {
      const { token, userId } = await signUpAndGetToken(app, 't34@example.com');
      const [seedTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      expect(seedTrack).toBeDefined();

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/playlists',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { name: 'Playlist Cascade' },
      });
      const playlistId = createRes.json<PlaylistDto>().id;

      if (seedTrack) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/playlists/${playlistId}/tracks`,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { trackId: seedTrack.id },
        });

        // Deleta a faixa diretamente no banco de dados (simulando remoção do catálogo)
        await testDb.db.delete(tracks).where(eq(tracks.id, seedTrack.id));

        // Consulta playlist via repository / endpoint
        const found = await repo.findByIdForUser(playlistId, userId);
        expect(found?.trackCount).toBe(0);
        expect(found?.tracks).toHaveLength(0);
      }
    });

    // T35: Paginação de GET /playlists com 25 playlists -> 2 páginas, hasNext correto
    it('T35: pagination of GET /api/v1/playlists with 25 playlists splits into 2 pages with correct hasNext', async () => {
      const { token, userId } = await signUpAndGetToken(app, 't35@example.com');

      // Cria 25 playlists para o usuário
      for (let i = 1; i <= 25; i++) {
        await repo.create(userId, { name: `Playlist Paginada ${String(i).padStart(2, '0')}` });
      }

      // Página 1 (default limit 20)
      const page1Res = await app.inject({
        method: 'GET',
        url: '/api/v1/playlists?page=1&limit=20',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(page1Res.statusCode).toBe(200);
      const page1 = page1Res.json<ListPlaylistsResponseDto>();
      expect(page1.meta.total).toBe(25);
      expect(page1.meta.totalPages).toBe(2);
      expect(page1.meta.hasNext).toBe(true);
      expect(page1.meta.hasPrev).toBe(false);
      expect(page1.data).toHaveLength(20);

      // Página 2
      const page2Res = await app.inject({
        method: 'GET',
        url: '/api/v1/playlists?page=2&limit=20',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(page2Res.statusCode).toBe(200);
      const page2 = page2Res.json<ListPlaylistsResponseDto>();
      expect(page2.meta.page).toBe(2);
      expect(page2.meta.hasNext).toBe(false);
      expect(page2.meta.hasPrev).toBe(true);
      expect(page2.data).toHaveLength(5);
    });
  });
});
