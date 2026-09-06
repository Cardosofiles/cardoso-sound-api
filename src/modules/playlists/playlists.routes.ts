import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UnauthorizedError } from '../../shared/errors/index.js';
import {
  addTrackToPlaylistBodySchema,
  createPlaylistBodySchema,
  errorResponseSchema,
  listPlaylistsQuerySchema,
  listPlaylistsResponseSchema,
  playlistDetailSchema,
  playlistParamsSchema,
  playlistSchema,
  playlistTrackParamsSchema,
  updatePlaylistBodySchema,
} from './playlists.schema.js';
import { PlaylistsService } from './playlists.service.js';

export interface PlaylistsRoutesOptions {
  service?: PlaylistsService;
}

function getUserId(request: { user: { id: string } | null }): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

export const playlistsRoutes: FastifyPluginAsyncZod<PlaylistsRoutesOptions> = async (
  fastify,
  opts,
) => {
  await Promise.resolve();

  const service = opts.service ?? new PlaylistsService();

  // R16: Listagem paginada de playlists do usuário autenticado
  fastify.get(
    '/playlists',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Lista as playlists do usuário autenticado',
        description:
          'Recupera a listagem paginada de playlists pertencentes exclusivamente ao usuário ativo.',
        operationId: 'listPlaylists',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        querystring: listPlaylistsQuerySchema,
        response: {
          200: listPlaylistsResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.listPlaylists(getUserId(request), request.query);
    },
  );

  // R17: Criação de nova playlist
  fastify.post(
    '/playlists',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Cria uma nova playlist para o usuário autenticado',
        description:
          'Cria uma nova playlist com nome e descrição opcional. Limite máximo de 50 playlists por usuário.',
        operationId: 'createPlaylist',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        body: createPlaylistBodySchema,
        response: {
          201: playlistSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await service.createPlaylist(getUserId(request), request.body);
      return reply.status(201).send(created);
    },
  );

  // R18: Consulta de playlist detalhada com suas faixas
  fastify.get(
    '/playlists/:id',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Recupera os detalhes de uma playlist com suas faixas',
        description:
          'Consulta os dados da playlist e sua lista de faixas associadas ordenadas por data de adição (addedAt ASC). Playlist alheia responde 404.',
        operationId: 'getPlaylistById',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: playlistParamsSchema,
        response: {
          200: playlistDetailSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getPlaylistById(getUserId(request), request.params.id);
    },
  );

  // R19: Atualização parcial de dados da playlist
  fastify.patch(
    '/playlists/:id',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Atualiza os dados de uma playlist',
        description:
          'Permite atualizar o nome e/ou descrição de uma playlist existente do usuário. Rejeita payloads vazios com 400. Playlist alheia responde 404.',
        operationId: 'updatePlaylist',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: playlistParamsSchema,
        body: updatePlaylistBodySchema,
        response: {
          200: playlistSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.updatePlaylist(getUserId(request), request.params.id, request.body);
    },
  );

  // R20: Exclusão de playlist
  fastify.delete(
    '/playlists/:id',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Exclui uma playlist do usuário',
        description:
          'Remove a playlist e seus vínculos de faixas de forma atômica em transação. Playlist alheia responde 404.',
        operationId: 'deletePlaylist',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: playlistParamsSchema,
        response: {
          204: z.void().describe('Playlist excluída com sucesso sem conteúdo retornado'),
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.deletePlaylist(getUserId(request), request.params.id);
      return reply.status(204).send();
    },
  );

  // R21: Inclusão de faixa na playlist
  fastify.post(
    '/playlists/:id/tracks',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Adiciona uma faixa musical a uma playlist',
        description:
          'Insere uma faixa existente do catálogo na playlist. Rejeita faixas repetidas com 409 e limite de 500 faixas com 422.',
        operationId: 'addTrackToPlaylist',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: playlistParamsSchema,
        body: addTrackToPlaylistBodySchema,
        response: {
          201: playlistDetailSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const detail = await service.addTrack(
        getUserId(request),
        request.params.id,
        request.body.trackId,
      );
      return reply.status(201).send(detail);
    },
  );

  // R22: Remoção de faixa da playlist
  fastify.delete(
    '/playlists/:id/tracks/:trackId',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Library'],
        summary: 'Remove uma faixa musical de uma playlist',
        description:
          'Remove o vínculo de uma faixa específica com a playlist. Responde 404 se a playlist ou a faixa não estiverem presentes.',
        operationId: 'removeTrackFromPlaylist',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        params: playlistTrackParamsSchema,
        response: {
          204: z.void().describe('Faixa removida da playlist com sucesso sem conteúdo retornado'),
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.removeTrack(getUserId(request), request.params.id, request.params.trackId);
      return reply.status(204).send();
    },
  );
};
