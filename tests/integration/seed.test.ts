import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_ARTISTS } from '../../src/db/seed/data/artists.data.js';
import { SEED_TRACKS } from '../../src/db/seed/data/tracks.data.js';
import { seed } from '../../src/db/seed/seed.js';
import { artists, tracks } from '../../src/db/schema/index.js';
import { startTestDatabase, truncateAll, type TestDatabase } from '../setup/testcontainers.js';

describe('Seed & Catalog Integration Tests', () => {
  let ctx: TestDatabase;

  beforeAll(async () => {
    ctx = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  }, 30_000);

  beforeEach(async () => {
    await truncateAll(ctx.db);
  });

  // T11: seed() em base limpa -> artistsInserted: 8, tracksInserted: 40
  it('T11: seed() on clean database inserts exactly 8 artists and 40 tracks', async () => {
    const result = await seed(ctx.db);

    expect(result.artistsInserted).toBe(8);
    expect(result.tracksInserted).toBe(40);
    expect(result.artistsTotal).toBe(8);
    expect(result.tracksTotal).toBe(40);
  });

  // T12: seed() uma 2ª vez -> artistsInserted: 0, tracksInserted: 0, sem exceção
  it('T12: running seed() a second time inserts 0 artists and 0 tracks without throwing', async () => {
    const firstResult = await seed(ctx.db);
    expect(firstResult.artistsInserted).toBe(8);
    expect(firstResult.tracksInserted).toBe(40);

    const secondResult = await seed(ctx.db);
    expect(secondResult.artistsInserted).toBe(0);
    expect(secondResult.tracksInserted).toBe(0);
  });

  // T13: Totais após 2 execuções -> artistsTotal: 8, tracksTotal: 40
  it('T13: database totals after two seed executions remain exactly 8 artists and 40 tracks', async () => {
    await seed(ctx.db);
    const secondResult = await seed(ctx.db);

    expect(secondResult.artistsTotal).toBe(8);
    expect(secondResult.tracksTotal).toBe(40);

    const [dbArtistsCount] = await ctx.db.select({ value: count() }).from(artists);
    const [dbTracksCount] = await ctx.db.select({ value: count() }).from(tracks);

    expect(Number(dbArtistsCount?.value)).toBe(8);
    expect(Number(dbTracksCount?.value)).toBe(40);
  });

  // T14: Toda faixa tem artistId válido -> join não devolve nulo
  it('T14: every track in database is joined to a valid artist', async () => {
    await seed(ctx.db);

    const joinedRows = await ctx.db
      .select({
        trackId: tracks.id,
        trackTitle: tracks.title,
        artistId: tracks.artistId,
        artistName: artists.name,
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id));

    expect(joinedRows).toHaveLength(40);
    for (const row of joinedRows) {
      expect(row.artistId).toBeDefined();
      expect(row.artistName).toBeTruthy();
    }
  });

  // T15: Cada um dos 6 gêneros -> count >= 5
  it('T15: every one of the 6 genres has at least 5 tracks', async () => {
    await seed(ctx.db);

    const genreCounts = await ctx.db
      .select({
        genre: tracks.genre,
        total: count(),
      })
      .from(tracks)
      .groupBy(tracks.genre);

    expect(genreCounts).toHaveLength(6);
    const countByGenre = new Map(genreCounts.map((g) => [g.genre, g.total]));

    const expectedGenres = ['rock', 'pop', 'electronic', 'hip-hop', 'jazz', 'lo-fi'] as const;
    for (const expectedGenre of expectedGenres) {
      const total = countByGenre.get(expectedGenre);
      expect(total).toBeDefined();
      expect(total).toBeGreaterThanOrEqual(5);
    }
  });

  // T16: Todo audioUrl casa soundhelix.com/.../SoundHelix-Song-\d+\.mp3
  it('T16: all track audioUrls match the SoundHelix mp3 regex pattern', async () => {
    await seed(ctx.db);

    const trackRows = await ctx.db.select({ audioUrl: tracks.audioUrl }).from(tracks);
    expect(trackRows).toHaveLength(40);

    const soundHelixRegex =
      /^https:\/\/www\.soundhelix\.com\/examples\/mp3\/SoundHelix-Song-\d+\.mp3$/;
    for (const row of trackRows) {
      expect(row.audioUrl).toMatch(soundHelixRegex);
    }
  });

  // T17: Toda durationSeconds -> > 0 (e dentro de 120..380)
  it('T17: all track durations are greater than zero and within expected range', async () => {
    await seed(ctx.db);

    const trackRows = await ctx.db.select({ durationSeconds: tracks.durationSeconds }).from(tracks);

    expect(trackRows).toHaveLength(40);
    for (const row of trackRows) {
      expect(row.durationSeconds).toBeGreaterThan(0);
      expect(row.durationSeconds).toBeGreaterThanOrEqual(120);
      expect(row.durationSeconds).toBeLessThanOrEqual(380);
    }
  });

  // T18: Nenhum par (artistName, title) duplicado em SEED_TRACKS (verificação em memória)
  it('T18: has no duplicate (artistName, title) pairs in SEED_TRACKS in memory', () => {
    const seen = new Set<string>();

    for (const track of SEED_TRACKS) {
      const key = `${track.artistName}:::${track.title}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    expect(seen.size).toBe(40);
  });

  // DoD: Tamanhos exatos e ausência de UUIDs literais
  it('DoD: SEED_ARTISTS has 8 items, SEED_TRACKS has 40 items and no literal UUIDs', () => {
    expect(SEED_ARTISTS).toHaveLength(8);
    expect(SEED_TRACKS).toHaveLength(40);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const artist of SEED_ARTISTS) {
      expect(uuidRegex.test(artist.name)).toBe(false);
    }
    for (const track of SEED_TRACKS) {
      expect(uuidRegex.test(track.artistName)).toBe(false);
      expect(uuidRegex.test(track.title)).toBe(false);
    }
  });
});
