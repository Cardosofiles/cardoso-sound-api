import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { errorResponseSchema, meSchema, updateMeBodySchema } from './users.schema.js';
import { UsersService } from './users.service.js';

export interface UsersRoutesOptions {
  service?: UsersService;
}

function getUserId(request: { user: { id: string } | null }): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

export const usersRoutes: FastifyPluginAsyncZod<UsersRoutesOptions> = async (fastify, opts) => {
  await Promise.resolve();

  const service = opts.service ?? new UsersService();

  // R13: Consulta do perfil do usuário autenticado
  fastify.get(
    '/me',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Profile'],
        summary: 'Retorna o perfil do usuário autenticado',
        description:
          'Recupera os dados cadastrais públicos e essenciais do usuário associado à sessão ativa.',
        operationId: 'getMe',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        response: {
          200: meSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.getMe(getUserId(request));
    },
  );

  // R14: Atualização parcial do perfil do usuário autenticado
  fastify.patch(
    '/me',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Profile'],
        summary: 'Atualiza o perfil do usuário autenticado',
        description:
          'Atualiza o nome de exibição e/ou a foto de perfil do usuário. Rejeita requisições com corpo vazio.',
        operationId: 'updateMe',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        body: updateMeBodySchema,
        response: {
          200: meSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.updateMe(getUserId(request), request.body);
    },
  );

  // R15: Exclusão da conta do usuário autenticado
  fastify.delete(
    '/me',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        tags: ['Profile'],
        summary: 'Remove a conta do usuário autenticado',
        description:
          'Exclui permanentemente o usuário e revoga em cascata todas as sessões e recursos vinculados.',
        operationId: 'deleteMe',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        response: {
          204: z.void().describe('Usuário excluído com sucesso sem conteúdo retornado'),
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.deleteMe(getUserId(request));
      return reply.status(204).send();
    },
  );
};
