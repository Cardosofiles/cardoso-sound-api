import { NotFoundError } from '../../shared/errors/index.js';
import {
  buildPaginationMeta,
  toOffset,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { TracksRepository } from './tracks.repository.js';
import type { Genre, GenreItemDto, ListTracksQuery, TrackDto } from './tracks.schema.js';

export class TracksService {
  constructor(private readonly repo: TracksRepository = new TracksRepository()) {}

  async list(query: ListTracksQuery): Promise<{ data: TrackDto[]; meta: PaginationMeta }> {
    const offset = toOffset({ page: query.page, limit: query.limit });

    const { rows, total } = await this.repo.list({
      limit: query.limit,
      offset,
      search: query.search,
      genre: query.genre,
      artistId: query.artistId,
      sort: query.sort,
    });

    const meta = buildPaginationMeta({
      page: query.page,
      limit: query.limit,
      total,
    });

    const data: TrackDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      album: row.album ?? null,
      genre: row.genre as Genre,
      durationSeconds: row.durationSeconds,
      coverUrl: row.coverUrl ?? null,
      audioUrl: row.audioUrl,
      artist: {
        id: row.artist.id,
        name: row.artist.name,
        avatarUrl: row.artist.avatarUrl ?? null,
      },
      createdAt: row.createdAt.toISOString(),
    }));

    return { data, meta };
  }

  async getById(id: string): Promise<TrackDto> {
    const row = await this.repo.findById(id);

    if (!row) {
      throw new NotFoundError('Track not found');
    }

    return {
      id: row.id,
      title: row.title,
      album: row.album ?? null,
      genre: row.genre as Genre,
      durationSeconds: row.durationSeconds,
      coverUrl: row.coverUrl ?? null,
      audioUrl: row.audioUrl,
      artist: {
        id: row.artist.id,
        name: row.artist.name,
        avatarUrl: row.artist.avatarUrl ?? null,
      },
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listGenres(): Promise<GenreItemDto[]> {
    const rows = await this.repo.listGenres();
    return rows.map((row) => ({
      genre: row.genre,
      trackCount: row.trackCount,
    }));
  }
}
