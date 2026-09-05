import type { Genre } from '../../config/constants.js';
import { NotFoundError } from '../../shared/errors/index.js';
import {
  buildPaginationMeta,
  toOffset,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { ArtistsRepository } from './artists.repository.js';
import type { ArtistDetailDto, ArtistDto, ListArtistsQuery } from './artists.schema.js';

export class ArtistsService {
  constructor(private readonly repo: ArtistsRepository = new ArtistsRepository()) {}

  async list(query: ListArtistsQuery): Promise<{ data: ArtistDto[]; meta: PaginationMeta }> {
    const offset = toOffset({ page: query.page, limit: query.limit });

    const { rows, total } = await this.repo.list({
      limit: query.limit,
      offset,
      search: query.search,
    });

    const meta = buildPaginationMeta({
      page: query.page,
      limit: query.limit,
      total,
    });

    const data: ArtistDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      bio: row.bio ?? null,
      avatarUrl: row.avatarUrl ?? null,
      trackCount: row.trackCount,
      createdAt: row.createdAt.toISOString(),
    }));

    return { data, meta };
  }

  async getById(id: string): Promise<ArtistDetailDto> {
    const row = await this.repo.findById(id);

    if (!row) {
      throw new NotFoundError('Artist not found');
    }

    return {
      id: row.id,
      name: row.name,
      bio: row.bio ?? null,
      avatarUrl: row.avatarUrl ?? null,
      trackCount: row.trackCount,
      createdAt: row.createdAt.toISOString(),
      tracks: row.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        album: track.album ?? null,
        genre: track.genre as Genre,
        durationSeconds: track.durationSeconds,
        coverUrl: track.coverUrl ?? null,
        audioUrl: track.audioUrl,
        artist: {
          id: row.id,
          name: row.name,
          avatarUrl: row.avatarUrl ?? null,
        },
        createdAt: track.createdAt.toISOString(),
      })),
    };
  }
}
