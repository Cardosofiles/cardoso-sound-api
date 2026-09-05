import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { artists } from '../../../src/db/schema/index.js';
import { seed } from '../../../src/db/seed/seed.js';
import { ArtistsRepository } from '../../../src/modules/artists/artists.repository.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../../setup/testcontainers.js';

describe('ArtistsRepository Integration Tests', () => {
  let ctx: TestDatabase;
  let repo: ArtistsRepository;

  beforeAll(async () => {
    ctx = await startTestDatabase();
    repo = new ArtistsRepository(ctx.db);
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(ctx.db);
    await seed(ctx.db);
  });

  // T9: list sem filtro após seed -> total === 8
  it('T9: list without filter returns all 8 seeded artists', async () => {
    const result = await repo.list({ limit: 20, offset: 0 });

    expect(result.total).toBe(8);
    expect(result.rows).toHaveLength(8);
  });

  // T10: list com limit: 5 -> rows.length === 5, total === 8
  it('T10: list with limit 5 returns exactly 5 rows and total 8', async () => {
    const result = await repo.list({ limit: 5, offset: 0 });

    expect(result.rows).toHaveLength(5);
    expect(result.total).toBe(8);
  });

  // T11: search com termo parcial minúsculo -> casa artista com maiúscula (ILIKE)
  it('T11: search with lowercase partial term matches artists case-insensitively', async () => {
    const result = await repo.list({ limit: 20, offset: 0, search: 'echoes' });

    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    const names = result.rows.map((row) => row.name);
    expect(names).toContain('Lunar Echoes');
    expect(names).toContain('Echoes of Orion');
  });

  // T12: search sem correspondência -> rows: [], total: 0
  it('T12: search with non-matching term returns empty rows and total 0', async () => {
    const result = await repo.list({
      limit: 20,
      offset: 0,
      search: 'non-matching-term-xyz',
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  // T13: trackCount de um artista do seed -> 5
  it('T13: trackCount for a seeded artist equals 5', async () => {
    const result = await repo.list({
      limit: 20,
      offset: 0,
      search: 'Aurora Avenue',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.trackCount).toBe(5);
  });

  // T14: findById de id inexistente -> null
  it('T14: findById for non-existent UUID returns null', async () => {
    const nonExistentId = randomUUID();
    const result = await repo.findById(nonExistentId);

    expect(result).toBeNull();
  });

  // T15: findById traz as faixas ordenadas por title ASC -> ordem verificada
  it('T15: findById returns all artist tracks ordered alphabetically by title ASC', async () => {
    const listResult = await repo.list({
      limit: 1,
      offset: 0,
      search: 'Aurora Avenue',
    });

    const artistId = listResult.rows[0]?.id;
    expect(artistId).toBeDefined();
    if (!artistId) {
      throw new Error('Expected artistId to be defined');
    }

    const detail = await repo.findById(artistId);
    expect(detail).not.toBeNull();
    expect(detail?.tracks.length).toBe(5);
    if (!detail) {
      throw new Error('Expected detail to be defined');
    }

    const titles = detail.tracks.map((track) => track.title);
    const sortedTitles = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sortedTitles);
  });

  // T16: Artista sem faixa nenhuma -> trackCount: 0 e tracks: []
  it('T16: artist without any tracks returns trackCount 0 and empty tracks array', async () => {
    const [extraArtist] = await ctx.db
      .insert(artists)
      .values({
        name: 'Silent Ensemble',
        bio: 'Ambient artist with no published tracks yet.',
      })
      .returning();

    expect(extraArtist).toBeDefined();
    if (!extraArtist) {
      throw new Error('Expected extraArtist to be defined');
    }

    // Valida no list
    const listResult = await repo.list({
      limit: 20,
      offset: 0,
      search: 'Silent Ensemble',
    });

    expect(listResult.total).toBe(1);
    expect(listResult.rows[0]?.trackCount).toBe(0);

    // Valida no findById
    const detail = await repo.findById(extraArtist.id);
    expect(detail).not.toBeNull();
    expect(detail?.trackCount).toBe(0);
    expect(detail?.tracks).toEqual([]);
  });

  // T17: search com caracteres curinga (% e _) escapa corretamente e não casa tudo
  it('T17: search with wildcard characters like % and _ escapes them properly', async () => {
    const resPercent = await repo.list({ limit: 20, offset: 0, search: '%' });
    expect(resPercent.total).toBe(0);
    expect(resPercent.rows).toEqual([]);

    const resUnderscore = await repo.list({ limit: 20, offset: 0, search: '_' });
    expect(resUnderscore.total).toBe(0);
    expect(resUnderscore.rows).toEqual([]);
  });
});
