import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TrackRow,
  TracksRepository,
} from '../../../../src/modules/tracks/tracks.repository.js';
import { TracksService } from '../../../../src/modules/tracks/tracks.service.js';
import { NotFoundError } from '../../../../src/shared/errors/index.js';

function createMockRepository() {
  const list = vi.fn();
  const findById = vi.fn();
  const listGenres = vi.fn();
  const repo = {
    list,
    findById,
    listGenres,
  } as unknown as TracksRepository;

  return { repo, list, findById, listGenres };
}

function createSampleTrackRow(index: number): TrackRow {
  return {
    id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    title: `Track ${String(index)}`,
    album: `Album ${String(index)}`,
    genre: 'rock',
    durationSeconds: 200 + index,
    coverUrl: `https://example.com/cover-${String(index)}.jpg`,
    audioUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${String(index)}.mp3`,
    createdAt: new Date('2026-09-04T12:00:00.000Z'),
    artist: {
      id: `11111111-1111-1111-1111-${String(index).padStart(12, '0')}`,
      name: `Artist ${String(index)}`,
      avatarUrl: `https://example.com/avatar-${String(index)}.jpg`,
    },
  };
}

describe('TracksService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: list com total 40, page 1 limit 20 -> meta.totalPages 2, hasNext true, hasPrev false
  it('T1: list with total 40, page 1, limit 20 returns totalPages 2, hasNext true, hasPrev false', async () => {
    const { repo, list } = createMockRepository();
    const rows = Array.from({ length: 20 }, (_, i) => createSampleTrackRow(i + 1));
    list.mockResolvedValue({ rows, total: 40 });

    const service = new TracksService(repo);
    const result = await service.list({ page: 1, limit: 20, sort: 'recent' });

    expect(result.data).toHaveLength(20);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
    expect(result.meta.total).toBe(40);
    expect(result.meta.totalPages).toBe(2);
    expect(result.meta.hasNext).toBe(true);
    expect(result.meta.hasPrev).toBe(false);
  });

  it('T1b: list page 2 of 40 items returns hasNext false, hasPrev true', async () => {
    const { repo, list } = createMockRepository();
    const rows = Array.from({ length: 20 }, (_, i) => createSampleTrackRow(i + 21));
    list.mockResolvedValue({ rows, total: 40 });

    const service = new TracksService(repo);
    const result = await service.list({ page: 2, limit: 20, sort: 'recent' });

    expect(result.meta.page).toBe(2);
    expect(result.meta.totalPages).toBe(2);
    expect(result.meta.hasNext).toBe(false);
    expect(result.meta.hasPrev).toBe(true);
  });

  it('T1c: list with total 0 returns empty array, totalPages 1, hasNext false, hasPrev false', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new TracksService(repo);
    const result = await service.list({ page: 1, limit: 20, sort: 'recent' });

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(1);
    expect(result.meta.hasNext).toBe(false);
    expect(result.meta.hasPrev).toBe(false);
  });

  // T2: sort default -> repository recebe 'recent'
  it('T2: sort default forwards "recent" to repository when sort is recent', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new TracksService(repo);
    await service.list({ page: 1, limit: 20, sort: 'recent' });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'recent',
      }),
    );
  });

  // T3: genre repassado -> repository recebe o valor fornecido
  it('T3: genre parameter is forwarded to repository', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new TracksService(repo);
    await service.list({ page: 1, limit: 20, sort: 'recent', genre: 'electronic' });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        genre: 'electronic',
      }),
    );
  });

  // T4: artistId repassado -> repository recebe o valor fornecido
  it('T4: artistId parameter is forwarded to repository', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new TracksService(repo);
    const artistId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await service.list({ page: 1, limit: 20, sort: 'recent', artistId });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId,
      }),
    );
  });

  // T5: getById com repository devolvendo null -> lança NotFoundError
  it('T5: getById throws NotFoundError when repository returns null', async () => {
    const { repo, findById } = createMockRepository();
    findById.mockResolvedValue(null);

    const service = new TracksService(repo);
    const nonExistentId = '11111111-1111-1111-1111-111111111111';

    await expect(service.getById(nonExistentId)).rejects.toThrow(NotFoundError);
    await expect(service.getById(nonExistentId)).rejects.toThrow('Track not found');
  });

  // T6: DTO embute artist como objeto e NÃO tem artistId ou artist_id
  it('T6: DTO embeds artist as object and does not expose raw database keys (artistId, artist_id)', async () => {
    const { repo, findById } = createMockRepository();
    const sampleRow = createSampleTrackRow(1);
    findById.mockResolvedValue(sampleRow);

    const service = new TracksService(repo);
    const result = await service.getById(sampleRow.id);

    expect(result.id).toBe(sampleRow.id);
    expect(result.title).toBe(sampleRow.title);
    expect(result.album).toBe(sampleRow.album);
    expect(result.genre).toBe(sampleRow.genre);
    expect(result.durationSeconds).toBe(sampleRow.durationSeconds);
    expect(result.coverUrl).toBe(sampleRow.coverUrl);
    expect(result.audioUrl).toBe(sampleRow.audioUrl);
    expect(result.createdAt).toBe(sampleRow.createdAt.toISOString());

    // Artista embutido
    expect(result.artist).toEqual({
      id: sampleRow.artist.id,
      name: sampleRow.artist.name,
      avatarUrl: sampleRow.artist.avatarUrl,
    });

    // Asserção estrita de chaves na raiz do DTO
    expect(result).not.toHaveProperty('artistId');
    expect(result).not.toHaveProperty('artist_id');
    expect(Object.keys(result).sort()).toEqual(
      [
        'album',
        'artist',
        'audioUrl',
        'coverUrl',
        'createdAt',
        'durationSeconds',
        'genre',
        'id',
        'title',
      ].sort(),
    );

    // Asserção estrita de chaves no ArtistSummary
    expect(Object.keys(result.artist).sort()).toEqual(['avatarUrl', 'id', 'name'].sort());
  });

  // T7: listGenres repassa e devolve array com genre e trackCount numérico
  it('T7: listGenres forwards call and returns array with genre and numeric trackCount', async () => {
    const { repo, listGenres } = createMockRepository();
    const mockGenres = [
      { genre: 'electronic', trackCount: 7 },
      { genre: 'hip-hop', trackCount: 6 },
      { genre: 'jazz', trackCount: 6 },
      { genre: 'lo-fi', trackCount: 6 },
      { genre: 'pop', trackCount: 7 },
      { genre: 'rock', trackCount: 8 },
    ];
    listGenres.mockResolvedValue(mockGenres);

    const service = new TracksService(repo);
    const result = await service.listGenres();

    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ genre: 'electronic', trackCount: 7 });
    expect(typeof result[0]?.trackCount).toBe('number');
    expect(listGenres).toHaveBeenCalledOnce();
  });
});
