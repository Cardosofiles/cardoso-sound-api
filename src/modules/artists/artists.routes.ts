import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  artistDetailSchema,
  artistParamsSchema,
  errorResponseSchema,
  listArtistsQuerySchema,
  listArtistsResponseSchema,
} from './artists.schema.js';
import { ArtistsService } from './artists.service.js';

export interface ArtistsRoutesOptions {
  service?: ArtistsService;
}

export const artistsRoutes: FastifyPluginAsyncZod<ArtistsRoutesOptions> = async (fastify, opts) => {
  await Promise.resolve();

  const service = opts.service ?? new ArtistsService();

  // R04: Listagem paginada de artistas do catálogo
  fastify.get(
    '/artists',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista artistas do catálogo',
        description:
          'Retorna uma lista paginada de artistas do catálogo musical, com suporte a busca textual por nome.',
        operationId: 'listArtists',
        querystring: listArtistsQuerySchema,
        response: {
          200: listArtistsResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.query);
    },
  );

  // R05: Detalhes do artista com faixas ordenadas por título
  fastify.get(
    '/artists/:id',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Obtém detalhes de um artista',
        description:
          'Retorna as informações completas de um artista e sua lista integral de faixas ordenadas por título em ordem ascendente.',
        operationId: 'getArtistById',
        params: artistParamsSchema,
        response: {
          200: artistDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getById(request.params.id);
    },
  );
};
