import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UnauthorizedError } from '../../shared/errors/index.js';
import {
  errorResponseSchema,
  favoriteItemSchema,
  favoriteTrackParamsSchema,
  listFavoritesQuerySchema,
  listFavoritesResponseSchema,
} from './favorites.schema.js';
import { FavoritesService } from './favorites.service.js';

export interface FavoritesRoutesOptions {
  service?: FavoritesService;
}

function getUserId(request: { user: { id: string } | null }): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

export const favoritesRoutes: FastifyPluginAsyncZod<FavoritesRoutesOptions> = async (
  fastify,
  opts,
) => {
  await Promise.resolve();

  const service = opts.service ?? new FavoritesService();

  // R23: Listagem paginada de favoritos do usuário autenticado
  fastify.get(
    '/favorites',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Lista as faixas favoritadas pelo usuário autenticado',
        description:
          'Recupera a listagem paginada de faixas favoritadas pelo usuário ativo, ordenadas pela data de inclusão (favoritedAt DESC).',
        operationId: 'listFavorites',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        querystring: listFavoritesQuerySchema,
        response: {
          200: listFavoritesResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.listFavorites(getUserId(request), request.query);
    },
  );

  // R24: Adição de faixa aos favoritos
  fastify.post(
    '/favorites/:trackId',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Adiciona uma faixa aos favoritos do usuário autenticado',
        description:
          'Marca uma faixa musical existente como favorita para o usuário autenticado. Retorna 404 se a faixa não existir e 409 se já favoritada.',
        operationId: 'addFavorite',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: favoriteTrackParamsSchema,
        response: {
          201: favoriteItemSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const item = await service.addFavorite(getUserId(request), request.params.trackId);
      return reply.status(201).send(item);
    },
  );

  // R25: Remoção de faixa dos favoritos
  fastify.delete(
    '/favorites/:trackId',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Remove uma faixa dos favoritos do usuário autenticado',
        description:
          'Desfavorita uma faixa musical previamente marcada pelo usuário ativo. Responde 404 se a faixa não estiver nos favoritos.',
        operationId: 'removeFavorite',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: favoriteTrackParamsSchema,
        response: {
          204: z.void().describe('Faixa removida dos favoritos com sucesso sem conteúdo retornado'),
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.removeFavorite(getUserId(request), request.params.trackId);
      return reply.status(204).send();
    },
  );
};
