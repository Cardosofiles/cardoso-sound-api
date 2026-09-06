import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client.js';
import { artists, playlistTracks, playlists, tracks } from '../../db/schema/index.js';

export interface PlaylistTrackRow {
  id: string;
  title: string;
  album: string | null;
  genre: string;
  durationSeconds: number;
  coverUrl: string | null;
  audioUrl: string;
  createdAt: Date;
  addedAt: Date;
  artist: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistDetailRow extends PlaylistRow {
  tracks: PlaylistTrackRow[];
}

export class PlaylistsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Lista playlists pertencentes a um usuário específico de forma paginada.
   * Utiliza subquery correlacionada para contagem de faixas, prevenindo distorções
   * decorrentes de joins com LIMIT (Decisões D-14, D-15 e D-31).
   */
  async listByUser(
    userId: string,
    p: { limit: number; offset: number },
  ): Promise<{ rows: PlaylistRow[]; total: number }> {
    const trackCountSql = this.db.$count(
      playlistTracks,
      eq(playlistTracks.playlistId, playlists.id),
    );

    const rowsPromise = this.db
      .select({
        id: playlists.id,
        name: playlists.name,
        description: playlists.description,
        trackCount: trackCountSql,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
      })
      .from(playlists)
      .where(eq(playlists.userId, userId))
      .orderBy(desc(playlists.createdAt), asc(playlists.id))
      .limit(p.limit)
      .offset(p.offset);

    const countPromise = this.db
      .select({ value: count() })
      .from(playlists)
      .where(eq(playlists.userId, userId));

    const [rows, [countResult]] = await Promise.all([rowsPromise, countPromise]);
    const total = countResult?.value ?? 0;

    return { rows, total };
  }

  /**
   * Contabiliza a quantidade total de playlists criadas por um determinado usuário.
   */
  async countByUser(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(playlists)
      .where(eq(playlists.userId, userId));

    return result?.value ?? 0;
  }

  /**
   * Recupera detalhes completos de uma playlist e suas faixas, isolando rigorosamente
   * por usuário no WHERE para garantir 404 sem vazar existência de recurso alheio (D-31).
   * Faixas ordenadas estritamente por addedAt ASC (D-15).
   */
  async findByIdForUser(id: string, userId: string): Promise<PlaylistDetailRow | null> {
    const [playlist] = await this.db
      .select({
        id: playlists.id,
        name: playlists.name,
        description: playlists.description,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
      })
      .from(playlists)
      .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
      .limit(1);

    if (!playlist) {
      return null;
    }

    const trackRows = await this.db
      .select({
        id: tracks.id,
        title: tracks.title,
        album: tracks.album,
        genre: tracks.genre,
        durationSeconds: tracks.durationSeconds,
        coverUrl: tracks.coverUrl,
        audioUrl: tracks.audioUrl,
        createdAt: tracks.createdAt,
        addedAt: playlistTracks.addedAt,
        artist: {
          id: artists.id,
          name: artists.name,
          avatarUrl: artists.avatarUrl,
        },
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(eq(playlistTracks.playlistId, id))
      .orderBy(asc(playlistTracks.addedAt), asc(tracks.id));

    return {
      ...playlist,
      trackCount: trackRows.length,
      tracks: trackRows,
    };
  }

  /**
   * Cria uma nova playlist vinculada ao usuário autenticado.
   */
  async create(
    userId: string,
    data: { name: string; description?: string | null },
  ): Promise<PlaylistRow> {
    const [created] = await this.db
      .insert(playlists)
      .values({
        userId,
        name: data.name,
        description: data.description ?? null,
      })
      .returning({
        id: playlists.id,
        name: playlists.name,
        description: playlists.description,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
      });

    if (!created) {
      throw new Error('Failed to create playlist');
    }

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      trackCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Atualiza dados de uma playlist do usuário, renovando updatedAt.
   * Filtro de posse no WHERE garante 404 para playlists alheias (D-31).
   */
  async update(
    id: string,
    userId: string,
    data: { name?: string; description?: string | null },
  ): Promise<PlaylistRow | null> {
    const setValues: {
      name?: string;
      description?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      setValues.name = data.name;
    }

    if (data.description !== undefined) {
      setValues.description = data.description;
    }

    const [updated] = await this.db
      .update(playlists)
      .set(setValues)
      .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
      .returning({
        id: playlists.id,
        name: playlists.name,
        description: playlists.description,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
      });

    if (!updated) {
      return null;
    }

    const trackCount = await this.countTracks(id);

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      trackCount,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Remove a playlist e seus itens atômica e explicitamente dentro de uma transação.
   */
  async delete(id: string, userId: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: playlists.id })
        .from(playlists)
        .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
        .limit(1);

      if (!existing) {
        return false;
      }

      await tx.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));

      const result = await tx
        .delete(playlists)
        .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
        .returning({ id: playlists.id });

      return result.length > 0;
    });
  }

  /**
   * Verifica a existência de uma faixa no catálogo musical.
   * Mantém o módulo autocontido sem importar outros repositórios (Opção (a) da §5.3).
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
   * Verifica se uma faixa já está associada à playlist (para 409 determinístico).
   */
  async hasTrack(playlistId: string, trackId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ playlistId: playlistTracks.playlistId })
      .from(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
      .limit(1);

    return Boolean(row);
  }

  /**
   * Adiciona uma faixa à playlist com tratamento de conflito (onConflictDoNothing).
   * Retorna false caso o registro já existisse.
   */
  async addTrack(playlistId: string, trackId: string): Promise<boolean> {
    const result = await this.db
      .insert(playlistTracks)
      .values({ playlistId, trackId })
      .onConflictDoNothing()
      .returning({ playlistId: playlistTracks.playlistId });

    return result.length > 0;
  }

  /**
   * Remove uma faixa específica de uma playlist.
   * Retorna false se o vínculo não existir.
   */
  async removeTrack(playlistId: string, trackId: string): Promise<boolean> {
    const result = await this.db
      .delete(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
      .returning({ playlistId: playlistTracks.playlistId });

    return result.length > 0;
  }

  /**
   * Contabiliza a quantidade de faixas associadas a uma playlist.
   */
  async countTracks(playlistId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId));

    return result?.value ?? 0;
  }
}
