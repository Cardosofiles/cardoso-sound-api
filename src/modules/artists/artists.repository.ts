import { asc, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { artists, tracks } from '../../db/schema/index.js';

export interface ArtistRow {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  trackCount: number;
  createdAt: Date;
}

export interface TrackSubRow {
  id: string;
  title: string;
  artistId: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
}

export interface ArtistDetailRow {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  trackCount: number;
  createdAt: Date;
  tracks: TrackSubRow[];
}

export class ArtistsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async list(input: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ rows: ArtistRow[]; total: number }> {
    let whereClause: SQL | undefined = undefined;

    if (input.search && input.search.trim().length > 0) {
      // Sanitiza caracteres especiais de busca LIKE/ILIKE no PostgreSQL (Armadilha 7)
      const sanitizedTerm = input.search.trim().replace(/[%_\\]/g, '\\$&');
      whereClause = ilike(artists.name, `%${sanitizedTerm}%`);
    }

    // Subquery correlacionada type-safe para contagem de faixas sem distorção por joins e paginação (Armadilha 2)
    const trackCountSql = this.db.$count(tracks, eq(tracks.artistId, artists.id));

    // Query 1: Registros paginados da página com ordenação canônica (Spec 03 §1)
    const rowsPromise = this.db
      .select({
        id: artists.id,
        name: artists.name,
        bio: artists.bio,
        avatarUrl: artists.avatarUrl,
        trackCount: trackCountSql,
        createdAt: artists.createdAt,
      })
      .from(artists)
      .where(whereClause)
      .orderBy(desc(artists.createdAt), asc(artists.id))
      .limit(input.limit)
      .offset(input.offset);

    // Query 2: Contagem total utilizando exatamente a mesma cláusula where (Armadilha 1)
    const countPromise = this.db.select({ value: count() }).from(artists).where(whereClause);

    const [rows, [countResult]] = await Promise.all([rowsPromise, countPromise]);
    const total = countResult?.value ?? 0;

    return { rows, total };
  }

  async findById(id: string): Promise<ArtistDetailRow | null> {
    // Consulta relacional do Drizzle ORM trazendo faixas ordenadas por title ASC (Armadilha 4)
    const result = await this.db.query.artists.findFirst({
      where: eq(artists.id, id),
      with: {
        tracks: {
          orderBy: (table, { asc: orderAsc }) => [orderAsc(table.title)],
        },
      },
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      name: result.name,
      bio: result.bio,
      avatarUrl: result.avatarUrl,
      trackCount: result.tracks.length,
      createdAt: result.createdAt,
      tracks: result.tracks,
    };
  }
}
