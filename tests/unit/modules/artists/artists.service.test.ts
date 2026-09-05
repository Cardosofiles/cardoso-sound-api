import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ArtistDetailRow,
  ArtistRow,
  ArtistsRepository,
} from '../../../../src/modules/artists/artists.repository.js';
import { ArtistsService } from '../../../../src/modules/artists/artists.service.js';
import { NotFoundError } from '../../../../src/shared/errors/index.js';

function createMockRepository() {
  const list = vi.fn();
  const findById = vi.fn();
  const repo = {
    list,
    findById,
  } as unknown as ArtistsRepository;

  return { repo, list, findById };
}

function createSampleArtistRow(index: number): ArtistRow {
  return {
    id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    name: `Artist ${String(index)}`,
    bio: `Bio of artist ${String(index)}`,
    avatarUrl: `https://example.com/avatar-${String(index)}.jpg`,
    trackCount: 5,
    createdAt: new Date('2026-09-04T12:00:00.000Z'),
  };
}

describe('ArtistsService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: list com 40 total, page 1 limit 20 -> meta.totalPages 2, hasNext true, hasPrev false
  it('T1: list with total 40, page 1, limit 20 returns totalPages 2, hasNext true, hasPrev false', async () => {
    const { repo, list } = createMockRepository();
    const rows = Array.from({ length: 20 }, (_, i) => createSampleArtistRow(i + 1));
    list.mockResolvedValue({ rows, total: 40 });

    const service = new ArtistsService(repo);
    const result = await service.list({ page: 1, limit: 20 });

    expect(result.data).toHaveLength(20);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
    expect(result.meta.total).toBe(40);
    expect(result.meta.totalPages).toBe(2);
    expect(result.meta.hasNext).toBe(true);
    expect(result.meta.hasPrev).toBe(false);
  });

  // T2: list page 2 -> hasNext false, hasPrev true
  it('T2: list page 2 of 40 items returns hasNext false, hasPrev true', async () => {
    const { repo, list } = createMockRepository();
    const rows = Array.from({ length: 20 }, (_, i) => createSampleArtistRow(i + 21));
    list.mockResolvedValue({ rows, total: 40 });

    const service = new ArtistsService(repo);
    const result = await service.list({ page: 2, limit: 20 });

    expect(result.meta.page).toBe(2);
    expect(result.meta.totalPages).toBe(2);
    expect(result.meta.hasNext).toBe(false);
    expect(result.meta.hasPrev).toBe(true);
  });

  // T3: list com total 0 -> data: [], totalPages 1, hasNext false
  it('T3: list with total 0 returns empty array, totalPages 1, hasNext false, hasPrev false', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new ArtistsService(repo);
    const result = await service.list({ page: 1, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(1);
    expect(result.meta.hasNext).toBe(false);
    expect(result.meta.hasPrev).toBe(false);
  });

  // T4: list repassa search ao repository -> mock chamado com o termo
  it('T4: list forwards search parameter to repository', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new ArtistsService(repo);
    await service.list({ page: 1, limit: 20, search: 'Midnight' });

    expect(list).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      search: 'Midnight',
    });
  });

  // T5: list calcula offset certo (page 3, limit 20) -> repository chamado com offset: 40
  it('T5: list calculates correct offset for page 3, limit 20 (offset 40)', async () => {
    const { repo, list } = createMockRepository();
    list.mockResolvedValue({ rows: [], total: 0 });

    const service = new ArtistsService(repo);
    await service.list({ page: 3, limit: 20 });

    expect(list).toHaveBeenCalledWith({
      limit: 20,
      offset: 40,
      search: undefined,
    });
  });

  // T6: getById com repository devolvendo null -> lança NotFoundError
  it('T6: getById throws NotFoundError when repository returns null', async () => {
    const { repo, findById } = createMockRepository();
    findById.mockResolvedValue(null);

    const service = new ArtistsService(repo);
    const nonExistentId = '11111111-1111-1111-1111-111111111111';

    await expect(service.getById(nonExistentId)).rejects.toThrow(NotFoundError);
    await expect(service.getById(nonExistentId)).rejects.toThrow('Artist not found');
  });

  // T7: getById com linha válida -> DTO no formato de Artist & { tracks }
  it('T7: getById with valid row returns DTO with Artist and formatted tracks', async () => {
    const { repo, findById } = createMockRepository();
    const artistId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sampleDate = new Date('2026-09-04T10:00:00.000Z');

    const validRow: ArtistDetailRow = {
      id: artistId,
      name: 'The Midnight Echoes',
      bio: 'Post-rock from São Paulo',
      avatarUrl: 'https://images.unsplash.com/avatar-1',
      trackCount: 2,
      createdAt: sampleDate,
      tracks: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          title: 'Neon Dusk',
          artistId: artistId,
          album: 'Nightfall',
          genre: 'rock',
          durationSeconds: 215,
          coverUrl: 'https://images.unsplash.com/cover-1',
          audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          createdAt: sampleDate,
        },
        {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          title: 'Shadows Fall',
          artistId: artistId,
          album: 'Nightfall',
          genre: 'rock',
          durationSeconds: 198,
          coverUrl: 'https://images.unsplash.com/cover-2',
          audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
          createdAt: sampleDate,
        },
      ],
    };

    findById.mockResolvedValue(validRow);

    const service = new ArtistsService(repo);
    const result = await service.getById(artistId);

    expect(result.id).toBe(artistId);
    expect(result.name).toBe('The Midnight Echoes');
    expect(result.bio).toBe('Post-rock from São Paulo');
    expect(result.avatarUrl).toBe('https://images.unsplash.com/avatar-1');
    expect(result.trackCount).toBe(2);
    expect(result.createdAt).toBe(sampleDate.toISOString());

    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(result.tracks[0]?.title).toBe('Neon Dusk');
    expect(result.tracks[0]?.album).toBe('Nightfall');
    expect(result.tracks[0]?.genre).toBe('rock');
    expect(result.tracks[0]?.durationSeconds).toBe(215);
    expect(result.tracks[0]?.audioUrl).toBe(
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    );
    expect(result.tracks[0]?.artist).toEqual({
      id: artistId,
      name: 'The Midnight Echoes',
      avatarUrl: 'https://images.unsplash.com/avatar-1',
    });
    expect(result.tracks[0]?.createdAt).toBe(sampleDate.toISOString());
  });

  // T8: DTO não contém campo cru do banco (artist_id etc.) -> asserção por chave
  it('T8: DTO does not expose raw database columns (artist_id, artistId)', async () => {
    const { repo, findById } = createMockRepository();
    const artistId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sampleDate = new Date('2026-09-04T10:00:00.000Z');

    const validRow: ArtistDetailRow = {
      id: artistId,
      name: 'The Midnight Echoes',
      bio: 'Post-rock from São Paulo',
      avatarUrl: null,
      trackCount: 1,
      createdAt: sampleDate,
      tracks: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          title: 'Neon Dusk',
          artistId: artistId,
          album: null,
          genre: 'rock',
          durationSeconds: 215,
          coverUrl: null,
          audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          createdAt: sampleDate,
        },
      ],
    };

    findById.mockResolvedValue(validRow);

    const service = new ArtistsService(repo);
    const result = await service.getById(artistId);

    // Chaves no topo do DTO Artist
    expect(result).not.toHaveProperty('artist_id');
    expect(result).not.toHaveProperty('artistId');
    expect(Object.keys(result).sort()).toEqual(
      ['avatarUrl', 'bio', 'createdAt', 'id', 'name', 'trackCount', 'tracks'].sort(),
    );

    // Chaves no item Track da lista tracks
    const firstTrack = result.tracks[0];
    expect(firstTrack).toBeDefined();
    if (!firstTrack) {
      throw new Error('Expected firstTrack to be defined');
    }
    expect(firstTrack).not.toHaveProperty('artist_id');
    expect(firstTrack).not.toHaveProperty('artistId');
    expect(Object.keys(firstTrack).sort()).toEqual(
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

    // Chaves no ArtistSummary embutido
    expect(Object.keys(firstTrack.artist).sort()).toEqual(['avatarUrl', 'id', 'name'].sort());
  });
});
