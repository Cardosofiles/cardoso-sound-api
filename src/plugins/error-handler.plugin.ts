import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { STATUS_CODES } from 'node:http';
import { AppError } from '../shared/errors/index.js';

export interface ErrorResponseEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details: unknown;
}

interface FastifyHttpError {
  statusCode: number;
  error?: string;
  message?: string;
}

function isFastifyHttpError(error: unknown): error is FastifyHttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  );
}

const errorHandler: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.setErrorHandler((error, request, reply) => {
    // 1. AppError de domínio
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.error,
        message: error.message,
        details: error.details,
      });
    }

    // 2. Erros de validação Zod capturados pelo Fastify type provider
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message,
        details: error.validation,
      });
    }

    // 3. Erros do próprio Fastify com statusCode numérico entre 400 e 499 (ex: 429 de rate-limit)
    if (isFastifyHttpError(error) && error.statusCode >= 400 && error.statusCode < 500) {
      const errorPhrase = error.error ?? STATUS_CODES[error.statusCode] ?? 'Bad Request';
      const message = error.message ?? errorPhrase;

      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: errorPhrase,
        message,
        details: null,
      });
    }

    // 4. Fallback não mapeado: 500 Internal Server Error seguro (sem vazar message, stack ou cause)
    request.log.error({ err: error }, 'unhandled error');

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
      details: null,
    });
  });

  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      details: null,
    });
  });

  done();
};

export const errorHandlerPlugin = fp(errorHandler, {
  name: 'error-handler-plugin',
});
