import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { artists, tracks } from '../../db/schema/index.js';
import type { Genre, TrackSort } from './tracks.schema.js';

export interface TrackArtistRow {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TrackRow {
  id: string;
  title: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
  artist: TrackArtistRow;
}

export interface GenreCountRow {
  genre: string;
  trackCount: number;
}

export class TracksRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async list(input: {
    limit: number;
    offset: number;
    search?: string;
    genre?: Genre;
    artistId?: string;
    sort: TrackSort;
  }): Promise<{ rows: TrackRow[]; total: number }> {
    const conditions: SQL[] = [];

    if (input.genre) {
      conditions.push(eq(tracks.genre, input.genre));
    }

    if (input.artistId) {
      conditions.push(eq(tracks.artistId, input.artistId));
    }

    if (input.search && input.search.trim().length > 0) {
      // Sanitiza caracteres especiais de busca LIKE/ILIKE no PostgreSQL
      const sanitized = input.search.trim().replace(/[%_\\]/g, '\\$&');
      const term = `%${sanitized}%`;
      const searchCondition = or(
        ilike(tracks.title, term),
        ilike(tracks.album, term),
        ilike(artists.name, term),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause: SQL[];
    switch (input.sort) {
      case 'title':
        orderByClause = [asc(tracks.title), asc(tracks.id)];
        break;
      case 'duration':
        orderByClause = [asc(tracks.durationSeconds), asc(tracks.id)];
        break;
      case 'recent':
      default:
        orderByClause = [desc(tracks.createdAt), asc(tracks.id)];
        break;
    }

    // Query 1: Registros da página com join em artists
    const rowsPromise = this.db
      .select({
        id: tracks.id,
        title: tracks.title,
        album: tracks.album,
        genre: tracks.genre,
        durationSeconds: tracks.durationSeconds,
        coverUrl: tracks.coverUrl,
        audioUrl: tracks.audioUrl,
        createdAt: tracks.createdAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(input.limit)
      .offset(input.offset);

    // Query 2: Contagem total com o mesmo join e where para consistência matemática
    const countPromise = this.db
      .select({ value: count() })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(whereClause);

    const [rows, [countResult]] = await Promise.all([rowsPromise, countPromise]);
    const total = countResult?.value ?? 0;

    return { rows, total };
  }

  async findById(id: string): Promise<TrackRow | null> {
    const [row] = await this.db
      .select({
        id: tracks.id,
        title: tracks.title,
        album: tracks.album,
        genre: tracks.genre,
        durationSeconds: tracks.durationSeconds,
        coverUrl: tracks.coverUrl,
        audioUrl: tracks.audioUrl,
        createdAt: tracks.createdAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(eq(tracks.id, id))
      .limit(1);

    return row ?? null;
  }

  async listGenres(): Promise<GenreCountRow[]> {
    const rows = await this.db
      .select({
        genre: tracks.genre,
        trackCount: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(tracks)
      .groupBy(tracks.genre)
      .orderBy(asc(tracks.genre));

    return rows;
  }
}
