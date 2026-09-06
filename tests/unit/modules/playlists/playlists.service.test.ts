import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlaylistDetailRow,
  PlaylistRow,
  PlaylistsRepository,
} from '../../../../src/modules/playlists/playlists.repository.js';
import { PlaylistsService } from '../../../../src/modules/playlists/playlists.service.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../src/shared/errors/index.js';

function createMockRepository() {
  const listByUser = vi.fn();
  const countByUser = vi.fn();
  const findByIdForUser = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const deletePlaylist = vi.fn();
  const trackExists = vi.fn();
  const hasTrack = vi.fn();
  const addTrack = vi.fn();
  const removeTrack = vi.fn();
  const countTracks = vi.fn();

  const repo = {
    listByUser,
    countByUser,
    findByIdForUser,
    create,
    update,
    delete: deletePlaylist,
    trackExists,
    hasTrack,
    addTrack,
    removeTrack,
    countTracks,
  } as unknown as PlaylistsRepository;

  return {
    repo,
    listByUser,
    countByUser,
    findByIdForUser,
    create,
    update,
    deletePlaylist,
    trackExists,
    hasTrack,
    addTrack,
    removeTrack,
    countTracks,
  };
}

function createSamplePlaylistRow(overrides?: Partial<PlaylistRow>): PlaylistRow {
  return {
    id: 'pl_123',
    name: 'Treino Pesado',
    description: 'Músicas para treinar',
    trackCount: 0,
    createdAt: new Date('2026-09-06T10:00:00.000Z'),
    updatedAt: new Date('2026-09-06T10:00:00.000Z'),
    ...overrides,
  };
}

function createSamplePlaylistDetailRow(overrides?: Partial<PlaylistDetailRow>): PlaylistDetailRow {
  return {
    id: 'pl_123',
    name: 'Treino Pesado',
    description: 'Músicas para treinar',
    trackCount: 1,
    createdAt: new Date('2026-09-06T10:00:00.000Z'),
    updatedAt: new Date('2026-09-06T10:00:00.000Z'),
    tracks: [
      {
        id: 'trk_456',
        title: 'Thunderstruck',
        album: 'The Razors Edge',
        genre: 'rock',
        durationSeconds: 292,
        coverUrl: 'https://example.com/cover.jpg',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        artist: {
          id: 'art_789',
          name: 'AC/DC',
          avatarUrl: 'https://example.com/artist.jpg',
        },
        createdAt: new Date('2026-09-06T10:00:00.000Z'),
        addedAt: new Date('2026-09-06T10:05:00.000Z'),
      },
    ],
    ...overrides,
  };
}

describe('PlaylistsService Unit Tests', () => {
  const userId = 'usr_owner_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: list monta meta igual ao padrão de F2-S03
  it('T1: listPlaylists builds meta pagination envelope matching canonical pattern', async () => {
    const { repo, listByUser } = createMockRepository();
    const rows = [createSamplePlaylistRow()];
    listByUser.mockResolvedValue({ rows, total: 40 });

    const service = new PlaylistsService(repo);
    const resultPage1 = await service.listPlaylists(userId, { page: 1, limit: 20 });

    expect(resultPage1.meta).toEqual({
      page: 1,
      limit: 20,
      total: 40,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });
    expect(resultPage1.data).toHaveLength(1);
    expect(resultPage1.data[0]?.id).toBe('pl_123');
    expect(resultPage1.data[0]?.createdAt).toBe('2026-09-06T10:00:00.000Z');

    const resultPage2 = await service.listPlaylists(userId, { page: 2, limit: 20 });
    expect(resultPage2.meta).toEqual({
      page: 2,
      limit: 20,
      total: 40,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  // T2: create com 49 playlists existentes -> passa
  it('T2: createPlaylist with 49 existing playlists succeeds', async () => {
    const { repo, countByUser, create } = createMockRepository();
    countByUser.mockResolvedValue(49);
    const sampleRow = createSamplePlaylistRow({ name: 'Nova Playlist' });
    create.mockResolvedValue(sampleRow);

    const service = new PlaylistsService(repo);
    const result = await service.createPlaylist(userId, { name: 'Nova Playlist' });

    expect(countByUser).toHaveBeenCalledWith(userId);
    expect(create).toHaveBeenCalledWith(userId, { name: 'Nova Playlist' });
    expect(result.name).toBe('Nova Playlist');
    expect(result.trackCount).toBe(0);
  });

  // T3: create com 50 -> lança ValidationError (422)
  it('T3: createPlaylist with 50 existing playlists throws ValidationError (422)', async () => {
    const { repo, countByUser, create } = createMockRepository();
    countByUser.mockResolvedValue(50);

    const service = new PlaylistsService(repo);

    await expect(service.createPlaylist(userId, { name: 'Playlist 51' })).rejects.toThrow(
      ValidationError,
    );
    await expect(service.createPlaylist(userId, { name: 'Playlist 51' })).rejects.toThrow(
      'Playlist limit reached',
    );
    expect(create).not.toHaveBeenCalled();
  });

  // T4: getById com repository null -> NotFoundError
  it('T4: getPlaylistById with null from repository throws NotFoundError (404)', async () => {
    const { repo, findByIdForUser } = createMockRepository();
    findByIdForUser.mockResolvedValue(null);

    const service = new PlaylistsService(repo);

    await expect(service.getPlaylistById(userId, 'pl_non_existent')).rejects.toThrow(NotFoundError);
    await expect(service.getPlaylistById(userId, 'pl_non_existent')).rejects.toThrow(
      'Playlist not found',
    );
    expect(findByIdForUser).toHaveBeenCalledWith('pl_non_existent', userId);
  });

  // T5: update com null -> NotFoundError
  it('T5: updatePlaylist with null from repository throws NotFoundError (404)', async () => {
    const { repo, update } = createMockRepository();
    update.mockResolvedValue(null);

    const service = new PlaylistsService(repo);

    await expect(
      service.updatePlaylist(userId, 'pl_other_user', { name: 'Updated' }),
    ).rejects.toThrow(NotFoundError);
    expect(update).toHaveBeenCalledWith('pl_other_user', userId, { name: 'Updated' });
  });

  // T6: delete com false -> NotFoundError
  it('T6: deletePlaylist with false from repository throws NotFoundError (404)', async () => {
    const { repo, deletePlaylist } = createMockRepository();
    deletePlaylist.mockResolvedValue(false);

    const service = new PlaylistsService(repo);

    await expect(service.deletePlaylist(userId, 'pl_other_user')).rejects.toThrow(NotFoundError);
    expect(deletePlaylist).toHaveBeenCalledWith('pl_other_user', userId);
  });

  // T7: addTrack com playlist null -> NotFoundError
  it('T7: addTrack with null playlist throws NotFoundError (404)', async () => {
    const { repo, findByIdForUser, trackExists } = createMockRepository();
    findByIdForUser.mockResolvedValue(null);

    const service = new PlaylistsService(repo);

    await expect(service.addTrack(userId, 'pl_invalid', 'trk_123')).rejects.toThrow(NotFoundError);
    await expect(service.addTrack(userId, 'pl_invalid', 'trk_123')).rejects.toThrow(
      'Playlist not found',
    );
    expect(trackExists).not.toHaveBeenCalled();
  });

  // T8: addTrack com faixa inexistente -> NotFoundError
  it('T8: addTrack with non-existent track throws NotFoundError (404)', async () => {
    const { repo, findByIdForUser, trackExists, hasTrack } = createMockRepository();
    findByIdForUser.mockResolvedValue(createSamplePlaylistDetailRow());
    trackExists.mockResolvedValue(false);

    const service = new PlaylistsService(repo);

    await expect(service.addTrack(userId, 'pl_123', 'trk_not_found')).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.addTrack(userId, 'pl_123', 'trk_not_found')).rejects.toThrow(
      'Track not found',
    );
    expect(hasTrack).not.toHaveBeenCalled();
  });

  // T9: addTrack com faixa já presente -> ConflictError (409)
  it('T9: addTrack with track already present throws ConflictError (409)', async () => {
    const { repo, findByIdForUser, trackExists, countTracks, hasTrack, addTrack } =
      createMockRepository();
    findByIdForUser.mockResolvedValue(createSamplePlaylistDetailRow());
    trackExists.mockResolvedValue(true);
    countTracks.mockResolvedValue(10);
    hasTrack.mockResolvedValue(true);

    const service = new PlaylistsService(repo);

    await expect(service.addTrack(userId, 'pl_123', 'trk_456')).rejects.toThrow(ConflictError);
    await expect(service.addTrack(userId, 'pl_123', 'trk_456')).rejects.toThrow(
      'Track already in playlist',
    );
    expect(addTrack).not.toHaveBeenCalled();

    // Cenário de corrida concorrente: hasTrack retornou false, mas addTrack retornou false
    hasTrack.mockResolvedValue(false);
    addTrack.mockResolvedValue(false);

    await expect(service.addTrack(userId, 'pl_123', 'trk_456')).rejects.toThrow(ConflictError);
  });

  // T10: addTrack com 500 faixas -> ValidationError (422)
  it('T10: addTrack with 500 existing tracks throws ValidationError (422)', async () => {
    const { repo, findByIdForUser, trackExists, countTracks, hasTrack } = createMockRepository();
    findByIdForUser.mockResolvedValue(createSamplePlaylistDetailRow());
    trackExists.mockResolvedValue(true);
    countTracks.mockResolvedValue(500);

    const service = new PlaylistsService(repo);

    await expect(service.addTrack(userId, 'pl_123', 'trk_new')).rejects.toThrow(ValidationError);
    await expect(service.addTrack(userId, 'pl_123', 'trk_new')).rejects.toThrow(
      'Playlist track limit reached',
    );
    expect(hasTrack).not.toHaveBeenCalled();
  });

  // T11: removeTrack com false -> NotFoundError (404)
  it('T11: removeTrack with false from repository throws NotFoundError (404)', async () => {
    const { repo, findByIdForUser, removeTrack } = createMockRepository();
    findByIdForUser.mockResolvedValue(createSamplePlaylistDetailRow());
    removeTrack.mockResolvedValue(false);

    const service = new PlaylistsService(repo);

    await expect(service.removeTrack(userId, 'pl_123', 'trk_missing')).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.removeTrack(userId, 'pl_123', 'trk_missing')).rejects.toThrow(
      'Track not found in playlist',
    );
  });

  // T12: Todo método que toca playlist repassa userId ao repository
  it('T12: every method touching a playlist forwards userId to the repository', async () => {
    const {
      repo,
      listByUser,
      countByUser,
      create,
      findByIdForUser,
      update,
      deletePlaylist,
      trackExists,
      countTracks,
      hasTrack,
      addTrack,
      removeTrack,
    } = createMockRepository();

    const detailRow = createSamplePlaylistDetailRow();
    listByUser.mockResolvedValue({ rows: [createSamplePlaylistRow()], total: 1 });
    countByUser.mockResolvedValue(0);
    create.mockResolvedValue(createSamplePlaylistRow());
    findByIdForUser.mockResolvedValue(detailRow);
    update.mockResolvedValue(createSamplePlaylistRow());
    deletePlaylist.mockResolvedValue(true);
    trackExists.mockResolvedValue(true);
    countTracks.mockResolvedValue(1);
    hasTrack.mockResolvedValue(false);
    addTrack.mockResolvedValue(true);
    removeTrack.mockResolvedValue(true);

    const service = new PlaylistsService(repo);

    // 1. listPlaylists
    await service.listPlaylists(userId, { page: 1, limit: 20 });
    expect(listByUser).toHaveBeenCalledWith(userId, expect.anything());

    // 2. createPlaylist
    await service.createPlaylist(userId, { name: 'Playlist Nova' });
    expect(countByUser).toHaveBeenCalledWith(userId);
    expect(create).toHaveBeenCalledWith(userId, { name: 'Playlist Nova' });

    // 3. getPlaylistById
    await service.getPlaylistById(userId, 'pl_123');
    expect(findByIdForUser).toHaveBeenCalledWith('pl_123', userId);

    // 4. updatePlaylist
    await service.updatePlaylist(userId, 'pl_123', { name: 'Atualizada' });
    expect(update).toHaveBeenCalledWith('pl_123', userId, { name: 'Atualizada' });

    // 5. deletePlaylist
    await service.deletePlaylist(userId, 'pl_123');
    expect(deletePlaylist).toHaveBeenCalledWith('pl_123', userId);

    // 6. addTrack
    await service.addTrack(userId, 'pl_123', 'trk_456');
    expect(findByIdForUser).toHaveBeenCalledWith('pl_123', userId);

    // 7. removeTrack
    await service.removeTrack(userId, 'pl_123', 'trk_456');
    expect(findByIdForUser).toHaveBeenCalledWith('pl_123', userId);
  });
});
