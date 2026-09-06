import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { pool, setPool } from '../../../src/db/client.js';
import { favorites, tracks } from '../../../src/db/schema/index.js';
import { seed } from '../../../src/db/seed/seed.js';
import { FavoritesRepository } from '../../../src/modules/favorites/favorites.repository.js';
import type {
  FavoriteItemDto,
  ListFavoritesResponseDto,
} from '../../../src/modules/favorites/favorites.schema.js';
import type { ErrorResponseEnvelope } from '../../../src/plugins/error-handler.plugin.js';
import { signUpAndGetToken } from '../../e2e/helpers/auth.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../../setup/testcontainers.js';

describe('FavoritesRepository & /api/v1/favorites Integration Tests', () => {
  let testDb: TestDatabase;
  let repo: FavoritesRepository;
  let app: FastifyInstance;
  const originalPool = pool;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    setPool(testDb.pool);
    repo = new FavoritesRepository(testDb.db);

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
  // Testes Diretos de FavoritesRepository
  // ============================================================================

  describe('FavoritesRepository Direct Methods', () => {
    it('Repo 1: trackExists returns true for existing track and false for missing', async () => {
      const [existingTrack] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(existingTrack).toBeDefined();

      if (existingTrack) {
        expect(await repo.trackExists(existingTrack.id)).toBe(true);
      }

      expect(await repo.trackExists('00000000-0000-0000-0000-000000000000')).toBe(false);
    });

    it('Repo 2: add and exists manage favorite record with joined artist and favoritedAt', async () => {
      const { userId } = await signUpAndGetToken(app, 'fav-repo2@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(track).toBeDefined();

      if (!track) return;

      expect(await repo.exists(userId, track.id)).toBe(false);

      const added = await repo.add(userId, track.id);
      expect(added).not.toBeNull();
      expect(added?.id).toBe(track.id);
      expect(added?.artist.name).toBeDefined();
      expect(added?.favoritedAt).toBeInstanceOf(Date);

      expect(await repo.exists(userId, track.id)).toBe(true);
    });

    it('Repo 3: add returns null when record already exists (race condition prevention)', async () => {
      const { userId } = await signUpAndGetToken(app, 'fav-repo3@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(track).toBeDefined();

      if (!track) return;

      const firstAdd = await repo.add(userId, track.id);
      expect(firstAdd).not.toBeNull();

      const secondAdd = await repo.add(userId, track.id);
      expect(secondAdd).toBeNull();
    });

    it('Repo 4: listByUser returns only favorites belonging to specified user', async () => {
      const userA = await signUpAndGetToken(app, 'fav-repo4-a@example.com');
      const userB = await signUpAndGetToken(app, 'fav-repo4-b@example.com');
      const trackList = await testDb.db.select({ id: tracks.id }).from(tracks).limit(3);
      expect(trackList).toHaveLength(3);

      const track0 = trackList[0];
      const track1 = trackList[1];
      const track2 = trackList[2];

      if (!track0 || !track1 || !track2) return;

      await repo.add(userA.userId, track0.id);
      await repo.add(userA.userId, track1.id);
      await repo.add(userB.userId, track2.id);

      const listA = await repo.listByUser(userA.userId, { limit: 10, offset: 0 });
      expect(listA.total).toBe(2);
      expect(listA.rows).toHaveLength(2);
      expect(listA.rows.map((r) => r.id)).toContain(track0.id);
      expect(listA.rows.map((r) => r.id)).toContain(track1.id);

      const listB = await repo.listByUser(userB.userId, { limit: 10, offset: 0 });
      expect(listB.total).toBe(1);
      expect(listB.rows).toHaveLength(1);
      expect(listB.rows[0]?.id).toBe(track2.id);
    });

    it('Repo 5: remove deletes favorite and returns true, or false if not found', async () => {
      const { userId } = await signUpAndGetToken(app, 'fav-repo5@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(track).toBeDefined();

      if (!track) return;

      await repo.add(userId, track.id);

      const removed = await repo.remove(userId, track.id);
      expect(removed).toBe(true);
      expect(await repo.exists(userId, track.id)).toBe(false);

      const removeAgain = await repo.remove(userId, track.id);
      expect(removeAgain).toBe(false);
    });
  });

  // ============================================================================
  // Testes HTTP e Integração via app.inject() (T8 a T22)
  // ============================================================================

  describe('HTTP Endpoints /api/v1/favorites (T8 a T22)', () => {
    // T8: POST /favorites/:trackId -> 201 com FavoriteItem
    it('T8: POST /favorites/:trackId returns 201 with complete FavoriteItem', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t8@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(track).toBeDefined();

      if (!track) return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      const payload = response.json<FavoriteItemDto>();
      expect(payload.id).toBe(track.id);
      expect(payload.title).toBeDefined();
      expect(payload.genre).toBeDefined();
      expect(payload.artist).toBeDefined();
      expect(payload.artist.id).toBeDefined();
      expect(payload.artist.name).toBeDefined();
      expect(payload.favoritedAt).toBeDefined();
      expect(new Date(payload.favoritedAt).toISOString()).toBe(payload.favoritedAt);
    });

    // T9: POST repetido -> 409
    it('T9: POST /favorites/:trackId repeated returns 409 Conflict', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t9@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(track).toBeDefined();

      if (!track) return;

      const firstResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(firstResponse.statusCode).toBe(201);

      const secondResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(secondResponse.statusCode).toBe(409);
      const err = secondResponse.json<ErrorResponseEnvelope>();
      expect(err.error).toBe('Conflict');
      expect(err.message).toBe('Track already in favorites');
    });

    // T10: POST com uuid inexistente -> 404
    it('T10: POST /favorites/:trackId with non-existent uuid returns 404 Not Found', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t10@example.com');
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${nonExistentUuid}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const err = response.json<ErrorResponseEnvelope>();
      expect(err.error).toBe('Not Found');
      expect(err.message).toBe('Track not found');
    });

    // T11: POST com id não-UUID -> 400
    it('T11: POST /favorites/:trackId with non-UUID id returns 400 Bad Request', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t11@example.com');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/favorites/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      const err = response.json<ErrorResponseEnvelope>();
      expect(err.error).toBe('Bad Request');
    });

    // T12: POST sem token -> 401
    it('T12: POST /favorites/:trackId without auth token returns 401 Unauthorized', async () => {
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);
      expect(track).toBeDefined();

      if (!track) return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
      });

      expect(response.statusCode).toBe(401);
      const err = response.json<ErrorResponseEnvelope>();
      expect(err.error).toBe('Unauthorized');
    });

    // T13: GET /favorites só traz os do usuário
    it('T13: GET /favorites isolates by user (User A favorites 2, User B favorites 1 -> A sees 2)', async () => {
      const userA = await signUpAndGetToken(app, 'fav-t13-a@example.com');
      const userB = await signUpAndGetToken(app, 'fav-t13-b@example.com');
      const trackList = await testDb.db.select({ id: tracks.id }).from(tracks).limit(3);
      expect(trackList).toHaveLength(3);

      const track0 = trackList[0];
      const track1 = trackList[1];
      const track2 = trackList[2];

      if (!track0 || !track1 || !track2) return;

      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track0.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track1.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track2.id}`,
        headers: { authorization: `Bearer ${userB.token}` },
      });

      const responseA = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${userA.token}` },
      });

      expect(responseA.statusCode).toBe(200);
      const payloadA = responseA.json<ListFavoritesResponseDto>();
      expect(payloadA.meta.total).toBe(2);
      expect(payloadA.data).toHaveLength(2);
      const idsA = payloadA.data.map((f) => f.id);
      expect(idsA).toContain(track0.id);
      expect(idsA).toContain(track1.id);
      expect(idsA).not.toContain(track2.id);

      const responseB = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${userB.token}` },
      });

      expect(responseB.statusCode).toBe(200);
      const payloadB = responseB.json<ListFavoritesResponseDto>();
      expect(payloadB.meta.total).toBe(1);
      expect(payloadB.data).toHaveLength(1);
      expect(payloadB.data[0]?.id).toBe(track2.id);
    });

    // T14: GET /favorites ordenado por favoritedAt DESC
    it('T14: GET /favorites ordered by favoritedAt DESC (most recent first)', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t14@example.com');
      const trackList = await testDb.db.select({ id: tracks.id }).from(tracks).limit(2);
      const track0 = trackList[0];
      const track1 = trackList[1];

      if (!track0 || !track1) return;

      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track0.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      // Pequena pausa para garantir timestamp estritamente diferente
      await new Promise((resolve) => setTimeout(resolve, 50));

      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track1.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json<ListFavoritesResponseDto>();
      expect(payload.data).toHaveLength(2);

      const time0 = new Date(payload.data[0]?.favoritedAt ?? 0).getTime();
      const time1 = new Date(payload.data[1]?.favoritedAt ?? 0).getTime();
      expect(time0).toBeGreaterThanOrEqual(time1);
      expect(payload.data[0]?.id).toBe(track1.id);
      expect(payload.data[1]?.id).toBe(track0.id);
    });

    // T15: GET /favorites vazio
    it('T15: GET /favorites empty returns data: [] and meta.total: 0', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t15@example.com');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json<ListFavoritesResponseDto>();
      expect(payload.data).toEqual([]);
      expect(payload.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    // T16: DELETE de favorito existente -> 204
    it('T16: DELETE /favorites/:trackId of existing favorite returns 204 No Content', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t16@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (!track) return;

      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(deleteResponse.statusCode).toBe(204);
      expect(deleteResponse.body).toBe('');

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${token}` },
      });

      const payload = getResponse.json<ListFavoritesResponseDto>();
      expect(payload.meta.total).toBe(0);
    });

    // T17: DELETE de favorito inexistente -> 404
    it('T17: DELETE /favorites/:trackId of non-existent favorite returns 404 Not Found', async () => {
      const { token } = await signUpAndGetToken(app, 'fav-t17@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (!track) return;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const err = response.json<ErrorResponseEnvelope>();
      expect(err.error).toBe('Not Found');
      expect(err.message).toBe('Favorite not found');
    });

    // T18: B tenta apagar o favorito de A -> 404; o de A continua lá
    it('T18: User B attempts to delete User A favorite -> returns 404 and User A favorite remains intact (D-31)', async () => {
      const userA = await signUpAndGetToken(app, 'fav-t18-a@example.com');
      const userB = await signUpAndGetToken(app, 'fav-t18-b@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (!track) return;

      // User A adiciona o favorito
      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });

      // User B tenta deletar o favorito de A
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${userB.token}` },
      });

      expect(deleteResponse.statusCode).toBe(404);
      const err = deleteResponse.json<ErrorResponseEnvelope>();
      expect(err.error).toBe('Not Found');

      // Favorito de User A continua perfeitamente intacto
      const checkA = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${userA.token}` },
      });

      const payloadA = checkA.json<ListFavoritesResponseDto>();
      expect(payloadA.meta.total).toBe(1);
      expect(payloadA.data[0]?.id).toBe(track.id);
    });

    // T19: Mesma faixa favoritada por 2 usuários -> ambos os registros coexistem
    it('T19: Same track favorited by two different users coexists (composite PK validation)', async () => {
      const userA = await signUpAndGetToken(app, 'fav-t19-a@example.com');
      const userB = await signUpAndGetToken(app, 'fav-t19-b@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (!track) return;

      const respA = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(respA.statusCode).toBe(201);

      const respB = await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${userB.token}` },
      });
      expect(respB.statusCode).toBe(201);

      const favRecords = await testDb.db
        .select()
        .from(favorites)
        .where(eq(favorites.trackId, track.id));

      expect(favRecords).toHaveLength(2);
      const userIds = favRecords.map((r) => r.userId);
      expect(userIds).toContain(userA.userId);
      expect(userIds).toContain(userB.userId);
    });

    // T20: Faixa apagada do catálogo -> some dos favoritos (cascade)
    it('T20: Track deleted from catalog cascades and disappears from user favorites', async () => {
      const { token, userId } = await signUpAndGetToken(app, 'fav-t20@example.com');
      const [track] = await testDb.db.select({ id: tracks.id }).from(tracks).limit(1);

      if (!track) return;

      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(await repo.exists(userId, track.id)).toBe(true);

      // Deleta a faixa diretamente no catálogo
      await testDb.db.delete(tracks).where(eq(tracks.id, track.id));

      const favRecords = await testDb.db
        .select()
        .from(favorites)
        .where(eq(favorites.trackId, track.id));
      expect(favRecords).toHaveLength(0);

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites',
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = getResponse.json<ListFavoritesResponseDto>();
      expect(payload.meta.total).toBe(0);
    });

    // T21: Usuário apagado (DELETE /me) -> favoritos somem (cascade)
    it('T21: User deleted via DELETE /api/v1/me cascades and purges favorites', async () => {
      const { token, userId } = await signUpAndGetToken(app, 'fav-t21@example.com');
      const trackList = await testDb.db.select({ id: tracks.id }).from(tracks).limit(2);
      const track0 = trackList[0];
      const track1 = trackList[1];

      if (!track0 || !track1) return;

      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track0.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/favorites/${track1.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const favBefore = await testDb.db
        .select()
        .from(favorites)
        .where(eq(favorites.userId, userId));
      expect(favBefore).toHaveLength(2);

      const deleteMeResponse = await app.inject({
        method: 'DELETE',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(deleteMeResponse.statusCode).toBe(204);

      const favAfter = await testDb.db.select().from(favorites).where(eq(favorites.userId, userId));
      expect(favAfter).toHaveLength(0);
    });

    // T22: Paginação com 25 favoritos -> 2 páginas, hasNext correto
    it('T22: Pagination with 25 favorites produces 2 pages with correct hasNext and hasPrev', async () => {
      const { token, userId } = await signUpAndGetToken(app, 'fav-t22@example.com');
      const trackList = await testDb.db.select({ id: tracks.id }).from(tracks).limit(25);
      expect(trackList).toHaveLength(25);

      for (const track of trackList) {
        await repo.add(userId, track.id);
      }

      // Página 1 (limit=20)
      const page1Response = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites?page=1&limit=20',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(page1Response.statusCode).toBe(200);
      const page1 = page1Response.json<ListFavoritesResponseDto>();
      expect(page1.data).toHaveLength(20);
      expect(page1.meta).toEqual({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
        hasNext: true,
        hasPrev: false,
      });

      // Página 2 (limit=20)
      const page2Response = await app.inject({
        method: 'GET',
        url: '/api/v1/favorites?page=2&limit=20',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(page2Response.statusCode).toBe(200);
      const page2 = page2Response.json<ListFavoritesResponseDto>();
      expect(page2.data).toHaveLength(5);
      expect(page2.meta).toEqual({
        page: 2,
        limit: 20,
        total: 25,
        totalPages: 2,
        hasNext: false,
        hasPrev: true,
      });
    });
  });
});
