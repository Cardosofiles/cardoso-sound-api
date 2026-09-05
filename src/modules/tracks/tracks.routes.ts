import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  errorResponseSchema,
  listGenresResponseSchema,
  listTracksQuerySchema,
  listTracksResponseSchema,
  trackParamsSchema,
  trackSchema,
} from './tracks.schema.js';
import { TracksService } from './tracks.service.js';

export interface TracksRoutesOptions {
  service?: TracksService;
}

export const tracksRoutes: FastifyPluginAsyncZod<TracksRoutesOptions> = async (fastify, opts) => {
  await Promise.resolve();

  const service = opts.service ?? new TracksService();

  // R06: Listagem paginada de faixas do catálogo com busca e filtros
  fastify.get(
    '/tracks',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista faixas do catálogo com busca e filtros',
        description:
          'Retorna uma lista paginada de faixas musicais, com suporte a busca textual, filtro por gênero, artista e ordenação.',
        operationId: 'listTracks',
        querystring: listTracksQuerySchema,
        response: {
          200: listTracksResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.query);
    },
  );

  // R07: Consulta de faixa por UUID
  fastify.get(
    '/tracks/:id',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Obtém detalhes de uma faixa',
        description:
          'Retorna as informações completas de uma faixa do catálogo musical identificada por seu UUID.',
        operationId: 'getTrackById',
        params: trackParamsSchema,
        response: {
          200: trackSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getById(request.params.id);
    },
  );

  // R08: Lista de gêneros com contagem de faixas
  fastify.get(
    '/genres',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Lista gêneros musicais com contagem de faixas',
        description:
          'Retorna a lista de gêneros musicais cadastrados no catálogo com a contagem total de faixas associadas.',
        operationId: 'listGenres',
        response: {
          200: listGenresResponseSchema,
        },
      },
    },
    async () => {
      const data = await service.listGenres();
      return { data };
    },
  );
};
