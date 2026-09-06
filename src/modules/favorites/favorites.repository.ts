import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { artists, favorites, tracks } from '../../db/schema/index.js';

export interface FavoriteRow {
  id: string;
  title: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
  favoritedAt: Date;
  artist: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export class FavoritesRepository {
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Lista faixas favoritadas por um usuário específico de forma paginada.
   * Junção favorites x tracks x artists, ordenada por favorites.createdAt DESC
   * com desempate determinístico por tracks.id ASC (Sprint §5.1 / Armadilhas 3 e 4).
   */
  async listByUser(
    userId: string,
    p: { limit: number; offset: number },
  ): Promise<{ rows: FavoriteRow[]; total: number }> {
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
        favoritedAt: favorites.createdAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(favorites)
      .innerJoin(tracks, eq(favorites.trackId, tracks.id))
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt), asc(tracks.id))
      .limit(p.limit)
      .offset(p.offset);

    const countPromise = this.db
      .select({ value: count() })
      .from(favorites)
      .where(eq(favorites.userId, userId));

    const [rows, [countResult]] = await Promise.all([rowsPromise, countPromise]);
    const total = countResult?.value ?? 0;

    return { rows, total };
  }

  /**
   * Verifica se uma determinada faixa já está favoritada pelo usuário autenticado.
   */
  async exists(userId: string, trackId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: favorites.userId })
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.trackId, trackId)))
      .limit(1);

    return Boolean(row);
  }

  /**
   * Verifica a existência de uma faixa no catálogo musical.
   * Repositório autocontido sem importar outros repositórios (Decisão D-47).
   */
  async trackExists(trackId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    return Boolean(row);
  }

  /**
   * Adiciona uma faixa aos favoritos do usuário autenticado com mitigação de corrida concorrente
   * via onConflictDoNothing(). Retorna null caso já existisse (Sprint §5.2 e Decisão D-47).
   */
  async add(userId: string, trackId: string): Promise<FavoriteRow | null> {
    const result = await this.db
      .insert(favorites)
      .values({ userId, trackId })
      .onConflictDoNothing()
      .returning({ userId: favorites.userId });

    if (result.length === 0) {
      return null;
    }

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
        favoritedAt: favorites.createdAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(favorites)
      .innerJoin(tracks, eq(favorites.trackId, tracks.id))
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(and(eq(favorites.userId, userId), eq(favorites.trackId, trackId)))
      .limit(1);

    return row ?? null;
  }

  /**
   * Remove a faixa dos favoritos do usuário autenticado.
   * Isolamento obrigatório por userId na cláusula WHERE (Decisão D-31).
   * Retorna false caso o favorito não existisse para aquele usuário.
   */
  async remove(userId: string, trackId: string): Promise<boolean> {
    const result = await this.db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.trackId, trackId)))
      .returning({ userId: favorites.userId });

    return result.length > 0;
  }
}
