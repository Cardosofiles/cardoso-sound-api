import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FavoriteRow,
  FavoritesRepository,
} from '../../../../src/modules/favorites/favorites.repository.js';
import { FavoritesService } from '../../../../src/modules/favorites/favorites.service.js';
import { ConflictError, NotFoundError } from '../../../../src/shared/errors/index.js';

function createMockRepository() {
  const listByUser = vi.fn();
  const exists = vi.fn();
  const trackExists = vi.fn();
  const add = vi.fn();
  const remove = vi.fn();

  const repo = {
    listByUser,
    exists,
    trackExists,
    add,
    remove,
  } as unknown as FavoritesRepository;

  return {
    repo,
    listByUser,
    exists,
    trackExists,
    add,
    remove,
  };
}

function createSampleFavoriteRow(overrides?: Partial<FavoriteRow>): FavoriteRow {
  return {
    id: 'f1a9b2c3-1111-4222-8333-444455556666',
    title: 'SoundHelix Song 1',
    album: 'Demo Album',
    genre: 'rock',
    durationSeconds: 372,
    coverUrl: 'https://example.com/cover.jpg',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    favoritedAt: new Date('2026-09-06T12:00:00.000Z'),
    artist: {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      name: 'Artist 1',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
    ...overrides,
  };
}

describe('FavoritesService Unit Tests', () => {
  const userId = 'usr_owner_456';
  const trackId = 'f1a9b2c3-1111-4222-8333-444455556666';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: list monta meta igual ao padrão canônico
  it('T1: listFavorites builds meta pagination envelope matching canonical pattern', async () => {
    const { repo, listByUser } = createMockRepository();
    const rows = [createSampleFavoriteRow()];
    listByUser.mockResolvedValue({ rows, total: 40 });

    const service = new FavoritesService(repo);
    const resultPage1 = await service.listFavorites(userId, { page: 1, limit: 20 });

    expect(resultPage1.meta).toEqual({
      page: 1,
      limit: 20,
      total: 40,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });
    expect(resultPage1.data).toHaveLength(1);
    expect(resultPage1.data[0]?.id).toBe(trackId);
    expect(resultPage1.data[0]?.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(resultPage1.data[0]?.favoritedAt).toBe('2026-09-06T12:00:00.000Z');

    const resultPage2 = await service.listFavorites(userId, { page: 2, limit: 20 });
    expect(resultPage2.meta).toEqual({
      page: 2,
      limit: 20,
      total: 40,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  // T2: add com faixa inexistente -> NotFoundError
  it('T2: addFavorite with non-existent track throws NotFoundError', async () => {
    const { repo, trackExists, exists, add } = createMockRepository();
    trackExists.mockResolvedValue(false);

    const service = new FavoritesService(repo);

    await expect(service.addFavorite(userId, trackId)).rejects.toThrow(NotFoundError);
    expect(trackExists).toHaveBeenCalledWith(trackId);
    expect(exists).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  // T3: add já favoritada -> ConflictError
  it('T3: addFavorite with already favorited track throws ConflictError', async () => {
    const { repo, trackExists, exists, add } = createMockRepository();
    trackExists.mockResolvedValue(true);
    exists.mockResolvedValue(true);

    const service = new FavoritesService(repo);

    await expect(service.addFavorite(userId, trackId)).rejects.toThrow(ConflictError);
    expect(trackExists).toHaveBeenCalledWith(trackId);
    expect(exists).toHaveBeenCalledWith(userId, trackId);
    expect(add).not.toHaveBeenCalled();
  });

  // T4: add com null do repository (corrida) -> ConflictError
  it('T4: addFavorite with null returned from repository (race condition) throws ConflictError', async () => {
    const { repo, trackExists, exists, add } = createMockRepository();
    trackExists.mockResolvedValue(true);
    exists.mockResolvedValue(false);
    add.mockResolvedValue(null);

    const service = new FavoritesService(repo);

    await expect(service.addFavorite(userId, trackId)).rejects.toThrow(ConflictError);
    expect(trackExists).toHaveBeenCalledWith(trackId);
    expect(exists).toHaveBeenCalledWith(userId, trackId);
    expect(add).toHaveBeenCalledWith(userId, trackId);
  });

  // T5: remove com false -> NotFoundError
  it('T5: removeFavorite with false returned from repository throws NotFoundError', async () => {
    const { repo, remove } = createMockRepository();
    remove.mockResolvedValue(false);

    const service = new FavoritesService(repo);

    await expect(service.removeFavorite(userId, trackId)).rejects.toThrow(NotFoundError);
    expect(remove).toHaveBeenCalledWith(userId, trackId);
  });

  // T6: Todo método repassa userId (asserção nos mocks)
  it('T6: All methods forward userId to repository', async () => {
    const { repo, listByUser, trackExists, exists, add, remove } = createMockRepository();
    const sampleRow = createSampleFavoriteRow();
    listByUser.mockResolvedValue({ rows: [sampleRow], total: 1 });
    trackExists.mockResolvedValue(true);
    exists.mockResolvedValue(false);
    add.mockResolvedValue(sampleRow);
    remove.mockResolvedValue(true);

    const service = new FavoritesService(repo);

    // List
    await service.listFavorites(userId, { page: 1, limit: 10 });
    expect(listByUser).toHaveBeenCalledWith(userId, { limit: 10, offset: 0 });

    // Add
    await service.addFavorite(userId, trackId);
    expect(exists).toHaveBeenCalledWith(userId, trackId);
    expect(add).toHaveBeenCalledWith(userId, trackId);

    // Remove
    await service.removeFavorite(userId, trackId);
    expect(remove).toHaveBeenCalledWith(userId, trackId);
  });

  // T7: DTO tem favoritedAt e artist embutido (asserção por chave)
  it('T7: DTO contains favoritedAt and embedded artist with proper keys', async () => {
    const { repo, trackExists, exists, add } = createMockRepository();
    const sampleRow = createSampleFavoriteRow();
    trackExists.mockResolvedValue(true);
    exists.mockResolvedValue(false);
    add.mockResolvedValue(sampleRow);

    const service = new FavoritesService(repo);
    const dto = await service.addFavorite(userId, trackId);

    expect(dto).toHaveProperty('id', sampleRow.id);
    expect(dto).toHaveProperty('title', sampleRow.title);
    expect(dto).toHaveProperty('album', sampleRow.album);
    expect(dto).toHaveProperty('genre', sampleRow.genre);
    expect(dto).toHaveProperty('durationSeconds', sampleRow.durationSeconds);
    expect(dto).toHaveProperty('coverUrl', sampleRow.coverUrl);
    expect(dto).toHaveProperty('audioUrl', sampleRow.audioUrl);
    expect(dto).toHaveProperty('createdAt', '2026-09-01T10:00:00.000Z');
    expect(dto).toHaveProperty('favoritedAt', '2026-09-06T12:00:00.000Z');

    expect(dto).toHaveProperty('artist');
    expect(dto.artist).toEqual({
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      name: 'Artist 1',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
  });
});
