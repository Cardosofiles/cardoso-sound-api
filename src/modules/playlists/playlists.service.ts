import { MAX_PLAYLISTS_PER_USER, MAX_TRACKS_PER_PLAYLIST } from '../../config/constants.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { buildPaginationMeta, toOffset } from '../../shared/utils/pagination.js';
import {
  PlaylistsRepository,
  type PlaylistDetailRow,
  type PlaylistRow,
} from './playlists.repository.js';
import type {
  CreatePlaylistInput,
  Genre,
  ListPlaylistsQuery,
  ListPlaylistsResponseDto,
  PlaylistDetailDto,
  PlaylistDto,
  UpdatePlaylistInput,
} from './playlists.schema.js';

function mapToPlaylistDto(row: PlaylistRow): PlaylistDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trackCount: row.trackCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapToPlaylistDetailDto(row: PlaylistDetailRow): PlaylistDetailDto {
  return {
    ...mapToPlaylistDto(row),
    tracks: row.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      album: track.album,
      genre: track.genre as Genre,
      durationSeconds: track.durationSeconds,
      coverUrl: track.coverUrl,
      audioUrl: track.audioUrl,
      artist: track.artist,
      createdAt: track.createdAt.toISOString(),
      addedAt: track.addedAt.toISOString(),
    })),
  };
}

export class PlaylistsService {
  constructor(private readonly repo: PlaylistsRepository = new PlaylistsRepository()) {}

  async listPlaylists(
    userId: string,
    query: ListPlaylistsQuery,
  ): Promise<ListPlaylistsResponseDto> {
    const offset = toOffset({ page: query.page, limit: query.limit });
    const { rows, total } = await this.repo.listByUser(userId, {
      limit: query.limit,
      offset,
    });

    return {
      data: rows.map(mapToPlaylistDto),
      meta: buildPaginationMeta({
        page: query.page,
        limit: query.limit,
        total,
      }),
    };
  }

  async createPlaylist(userId: string, input: CreatePlaylistInput): Promise<PlaylistDto> {
    const currentCount = await this.repo.countByUser(userId);

    if (currentCount >= MAX_PLAYLISTS_PER_USER) {
      throw new ValidationError('Playlist limit reached', {
        limit: MAX_PLAYLISTS_PER_USER,
      });
    }

    const created = await this.repo.create(userId, input);

    return mapToPlaylistDto(created);
  }

  async getPlaylistById(userId: string, id: string): Promise<PlaylistDetailDto> {
    const row = await this.repo.findByIdForUser(id, userId);

    if (!row) {
      throw new NotFoundError('Playlist not found');
    }

    return mapToPlaylistDetailDto(row);
  }

  async updatePlaylist(
    userId: string,
    id: string,
    input: UpdatePlaylistInput,
  ): Promise<PlaylistDto> {
    const updated = await this.repo.update(id, userId, input);

    if (!updated) {
      throw new NotFoundError('Playlist not found');
    }

    return mapToPlaylistDto(updated);
  }

  async deletePlaylist(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(id, userId);

    if (!deleted) {
      throw new NotFoundError('Playlist not found');
    }
  }

  /**
   * Adiciona uma faixa à playlist seguindo rigorosamente a ordem de verificação
   * exigida pela spec (Sprint §5.3):
   * 1. findByIdForUser(playlistId, userId) -> null => 404
   * 2. a faixa existe? -> false => 404
   * 3. countTracks >= MAX_TRACKS_PER_PLAYLIST => 422
   * 4. já está na playlist? => 409 (ConflictError)
   * 5. inserir com onConflictDoNothing().returning() (proteção contra race condition)
   * 6. devolver PlaylistDetail atualizado => 201
   */
  async addTrack(userId: string, playlistId: string, trackId: string): Promise<PlaylistDetailDto> {
    const playlist = await this.repo.findByIdForUser(playlistId, userId);

    if (!playlist) {
      throw new NotFoundError('Playlist not found');
    }

    const trackExists = await this.repo.trackExists(trackId);

    if (!trackExists) {
      throw new NotFoundError('Track not found');
    }

    const currentTracksCount = await this.repo.countTracks(playlistId);

    if (currentTracksCount >= MAX_TRACKS_PER_PLAYLIST) {
      throw new ValidationError('Playlist track limit reached', {
        limit: MAX_TRACKS_PER_PLAYLIST,
      });
    }

    const alreadyPresent = await this.repo.hasTrack(playlistId, trackId);

    if (alreadyPresent) {
      throw new ConflictError('Track already in playlist');
    }

    const added = await this.repo.addTrack(playlistId, trackId);

    if (!added) {
      throw new ConflictError('Track already in playlist');
    }

    const updated = await this.repo.findByIdForUser(playlistId, userId);

    if (!updated) {
      throw new NotFoundError('Playlist not found');
    }

    return mapToPlaylistDetailDto(updated);
  }

  /**
   * Remove uma faixa da playlist.
   * Valida a posse da playlist antes de tentar a remoção da linha associativa.
   */
  async removeTrack(userId: string, playlistId: string, trackId: string): Promise<void> {
    const playlist = await this.repo.findByIdForUser(playlistId, userId);

    if (!playlist) {
      throw new NotFoundError('Playlist not found');
    }

    const removed = await this.repo.removeTrack(playlistId, trackId);

    if (!removed) {
      throw new NotFoundError('Track not found in playlist');
    }
  }
}
