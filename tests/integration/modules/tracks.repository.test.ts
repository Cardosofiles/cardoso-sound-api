import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../../src/db/seed/seed.js';
import { TracksRepository } from '../../../src/modules/tracks/tracks.repository.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../../setup/testcontainers.js';

describe('TracksRepository Integration Tests', () => {
  let ctx: TestDatabase;
  let repo: TracksRepository;

  beforeAll(async () => {
    ctx = await startTestDatabase();
    repo = new TracksRepository(ctx.db);
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(ctx.db);
    await seed(ctx.db);
  });

  // T8: list sem filtro após seed -> total === 40, rows.length === 20
  it('T8: list without filter returns 20 rows and total 40', async () => {
    const result = await repo.list({ limit: 20, offset: 0, sort: 'recent' });

    expect(result.total).toBe(40);
    expect(result.rows).toHaveLength(20);
  });

  // T9: limit: 20, offset: 20 -> rows.length === 20, sem repetir id da página 1
  it('T9: list with limit 20 and offset 20 returns 20 rows disjoint from page 1', async () => {
    const page1 = await repo.list({ limit: 20, offset: 0, sort: 'recent' });
    const page2 = await repo.list({ limit: 20, offset: 20, sort: 'recent' });

    expect(page1.rows).toHaveLength(20);
    expect(page2.rows).toHaveLength(20);

    const page1Ids = new Set(page1.rows.map((row) => row.id));
    const page2Ids = new Set(page2.rows.map((row) => row.id));

    // Nenhuma interseção
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  // T10: genre: 'rock' -> só faixas de rock, total bate com o seed (8)
  it('T10: list with genre "rock" returns only rock tracks and total 8', async () => {
    const result = await repo.list({ limit: 100, offset: 0, sort: 'recent', genre: 'rock' });

    expect(result.total).toBe(8);
    expect(result.rows).toHaveLength(8);
    for (const row of result.rows) {
      expect(row.genre).toBe('rock');
    }
  });

  // T11: genre + search combinados -> AND, não OR
  it('T11: combining genre and search filters applies AND logic', async () => {
    // Busca por termo presente em faixa de rock
    const rockAndSearch = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      genre: 'rock',
      search: 'Overdrive',
    });

    expect(rockAndSearch.total).toBeGreaterThanOrEqual(1);
    for (const row of rockAndSearch.rows) {
      expect(row.genre).toBe('rock');
      expect(row.title.toLowerCase()).toContain('overdrive');
    }

    // Mesmo search com gênero que não possui essa faixa retorna vazio
    const electronicAndSearch = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      genre: 'electronic',
      search: 'Overdrive',
    });

    expect(electronicAndSearch.total).toBe(0);
    expect(electronicAndSearch.rows).toHaveLength(0);
  });

  // T12: search por trecho do título, minúsculo -> casa título com maiúscula
  it('T12: search by lowercase title fragment matches case-insensitively', async () => {
    const result = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      search: 'overdrive',
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    const titles = result.rows.map((r) => r.title);
    expect(titles.some((t) => t.includes('Midnight Overdrive'))).toBe(true);
  });

  // T13: search por nome do artista -> devolve as faixas dele
  it('T13: search by artist name returns all tracks belonging to that artist', async () => {
    const result = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      search: 'Aurora Avenue',
    });

    expect(result.total).toBe(5);
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) {
      expect(row.artist.name).toBe('Aurora Avenue');
    }
  });

  // T14: search por trecho do álbum -> devolve as faixas do álbum
  it('T14: search by album fragment returns tracks from that album', async () => {
    const result = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      search: 'Starlight Reverie',
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    for (const row of result.rows) {
      expect(row.album).toBe('Starlight Reverie');
    }
  });

  // T15: search sem correspondência -> rows: [], total: 0
  it('T15: search with non-matching term returns empty rows and total 0', async () => {
    const result = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      search: 'non-existent-track-album-artist-query',
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  // T16: artistId inexistente (uuid válido) -> rows: [], total: 0 — não lança
  it('T16: valid but non-existent artistId UUID returns empty rows and total 0 without throwing', async () => {
    const nonExistentArtistId = randomUUID();
    const result = await repo.list({
      limit: 20,
      offset: 0,
      sort: 'recent',
      artistId: nonExistentArtistId,
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  // T17: sort: 'title' -> ordem alfabética ascendente
  it('T17: sort by "title" returns tracks ordered alphabetically by title ASC', async () => {
    const result = await repo.list({ limit: 40, offset: 0, sort: 'title' });

    expect(result.rows).toHaveLength(40);
    const titles = result.rows.map((row) => row.title);
    const sortedTitles = [...titles].sort();
    expect(titles).toEqual(sortedTitles);
  });

  // T18: sort: 'duration' -> ordem crescente de durationSeconds
  it('T18: sort by "duration" returns tracks ordered ascending by durationSeconds', async () => {
    const result = await repo.list({ limit: 40, offset: 0, sort: 'duration' });

    expect(result.rows).toHaveLength(40);
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1]?.durationSeconds ?? 0;
      const curr = result.rows[i]?.durationSeconds ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  // T19: Paginar as 40 faixas em 2 páginas de 20 -> união = 40 ids distintos
  it('T19: paginating 40 tracks into two pages of 20 yields 40 distinct track IDs', async () => {
    const page1 = await repo.list({ limit: 20, offset: 0, sort: 'recent' });
    const page2 = await repo.list({ limit: 20, offset: 20, sort: 'recent' });

    expect(page1.rows).toHaveLength(20);
    expect(page2.rows).toHaveLength(20);

    const allIds = new Set([...page1.rows.map((r) => r.id), ...page2.rows.map((r) => r.id)]);
    expect(allIds.size).toBe(40);
  });

  // T20: findById de id inexistente -> null
  it('T20: findById with non-existent UUID returns null', async () => {
    const nonExistentId = randomUUID();
    const result = await repo.findById(nonExistentId);

    expect(result).toBeNull();
  });

  // T21: findById traz artist -> join presente
  it('T21: findById embeds artist information via innerJoin', async () => {
    const listResult = await repo.list({ limit: 1, offset: 0, sort: 'recent' });
    const trackId = listResult.rows[0]?.id;
    expect(trackId).toBeDefined();
    if (!trackId) {
      throw new Error('Expected trackId to be defined');
    }

    const detail = await repo.findById(trackId);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(trackId);
    expect(detail?.artist).toBeDefined();
    expect(detail?.artist.id).toBeDefined();
    expect(detail?.artist.name).toBeTruthy();
    expect(detail).not.toHaveProperty('artistId');
  });

  // T22: listGenres -> 6 entradas, trackCount numérico, cada uma >= 5
  it('T22: listGenres returns 6 genres with numeric trackCount >= 5 ordered by genre ASC', async () => {
    const genres = await repo.listGenres();

    expect(genres).toHaveLength(6);

    const genreNames = genres.map((g) => g.genre);
    const sortedGenreNames = [...genreNames].sort((a, b) => a.localeCompare(b));
    expect(genreNames).toEqual(sortedGenreNames);

    let totalTracks = 0;
    for (const item of genres) {
      expect(typeof item.trackCount).toBe('number');
      expect(item.trackCount).toBeGreaterThanOrEqual(5);
      totalTracks += item.trackCount;
    }
    expect(totalTracks).toBe(40);
  });

  // T23: search com caracteres curinga (% e _) escapa corretamente e não casa tudo
  it('T23: search with wildcard characters (% and _) escapes properly and does not match all', async () => {
    const resPercent = await repo.list({ limit: 20, offset: 0, sort: 'recent', search: '%' });
    expect(resPercent.total).toBe(0);
    expect(resPercent.rows).toEqual([]);

    const resUnderscore = await repo.list({ limit: 20, offset: 0, sort: 'recent', search: '_' });
    expect(resUnderscore.total).toBe(0);
    expect(resUnderscore.rows).toEqual([]);
  });
});
