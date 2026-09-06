import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { buildPaginationMeta, toOffset } from '../../shared/utils/pagination.js';
import { FavoritesRepository, type FavoriteRow } from './favorites.repository.js';
import type {
  FavoriteItemDto,
  Genre,
  ListFavoritesQuery,
  ListFavoritesResponseDto,
} from './favorites.schema.js';

function mapToFavoriteItemDto(row: FavoriteRow): FavoriteItemDto {
  return {
    id: row.id,
    title: row.title,
    album: row.album,
    genre: row.genre as Genre,
    durationSeconds: row.durationSeconds,
    coverUrl: row.coverUrl,
    audioUrl: row.audioUrl,
    artist: row.artist,
    createdAt: row.createdAt.toISOString(),
    favoritedAt: row.favoritedAt.toISOString(),
  };
}

export class FavoritesService {
  constructor(private readonly repo: FavoritesRepository = new FavoritesRepository()) {}

  /**
   * Lista faixas favoritadas pelo usuário com envelope de paginação canônico (R23).
   */
  async listFavorites(
    userId: string,
    query: ListFavoritesQuery,
  ): Promise<ListFavoritesResponseDto> {
    const offset = toOffset({ page: query.page, limit: query.limit });
    const { rows, total } = await this.repo.listByUser(userId, {
      limit: query.limit,
      offset,
    });

    return {
      data: rows.map(mapToFavoriteItemDto),
      meta: buildPaginationMeta({
        page: query.page,
        limit: query.limit,
        total,
      }),
    };
  }

  /**
   * Adiciona uma faixa aos favoritos seguindo a ordem de verificação mandatória (R24):
   * 1. A faixa existe no catálogo? -> 404 (NotFoundError)
   * 2. Já está favoritada? -> 409 (ConflictError)
   * 3. Inserção com onConflictDoNothing(); se nulo (corrida concorrente) -> 409 (ConflictError)
   * 4. Retorna o FavoriteItem completo (201 Created)
   */
  async addFavorite(userId: string, trackId: string): Promise<FavoriteItemDto> {
    const trackExists = await this.repo.trackExists(trackId);

    if (!trackExists) {
      throw new NotFoundError('Track not found');
    }

    const alreadyFavorited = await this.repo.exists(userId, trackId);

    if (alreadyFavorited) {
      throw new ConflictError('Track already in favorites');
    }

    const favorite = await this.repo.add(userId, trackId);

    if (!favorite) {
      throw new ConflictError('Track already in favorites');
    }

    return mapToFavoriteItemDto(favorite);
  }

  /**
   * Remove uma faixa dos favoritos do usuário autenticado (R25).
   * Retorna 404 se a faixa não estiver presente nos favoritos do usuário (Decisão D-31).
   */
  async removeFavorite(userId: string, trackId: string): Promise<void> {
    const removed = await this.repo.remove(userId, trackId);

    if (!removed) {
      throw new NotFoundError('Favorite not found');
    }
  }
}
