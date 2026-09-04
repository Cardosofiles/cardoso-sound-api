import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/shared/errors/index.js';

describe('Shared Errors Hierarchy', () => {
  // T1: new NotFoundError('Track not found') -> statusCode 404, error 'Not Found', instanceof AppError, instanceof Error
  it('T1: creates NotFoundError with custom message and correct hierarchy', () => {
    const error = new NotFoundError('Track not found');

    expect(error.statusCode).toBe(404);
    expect(error.error).toBe('Not Found');
    expect(error.message).toBe('Track not found');
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  // T2: Cada uma das 5 classes com par statusCode/error correto
  it('T2: verifies statusCode and error literal for each of the 5 subclasses', () => {
    const notFound = new NotFoundError();
    expect(notFound.statusCode).toBe(404);
    expect(notFound.error).toBe('Not Found');
    expect(notFound.message).toBe('Resource not found');

    const unauthorized = new UnauthorizedError();
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.error).toBe('Unauthorized');
    expect(unauthorized.message).toBe('Authentication required');

    const forbidden = new ForbiddenError();
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.error).toBe('Forbidden');
    expect(forbidden.message).toBe('Access forbidden');

    const conflict = new ConflictError();
    expect(conflict.statusCode).toBe(409);
    expect(conflict.error).toBe('Conflict');
    expect(conflict.message).toBe('Resource already exists');

    const validation = new ValidationError();
    expect(validation.statusCode).toBe(422);
    expect(validation.error).toBe('Unprocessable Entity');
    expect(validation.message).toBe('Validation failed');
  });

  // T3: details default -> null
  it('T3: defaults details to null for all error subclasses', () => {
    const errors = [
      new NotFoundError(),
      new UnauthorizedError(),
      new ForbiddenError(),
      new ConflictError(),
      new ValidationError(),
    ];

    for (const err of errors) {
      expect(err.details).toBeNull();
    }
  });

  // T4: details passado no construtor -> preservado
  it('T4: preserves custom details passed to the constructor', () => {
    const customDetails = { field: 'email', reason: 'already registered' };
    const conflict = new ConflictError('Email in use', customDetails);
    expect(conflict.details).toEqual(customDetails);

    const validationDetails = [{ path: 'limit', message: 'must be <= 100' }];
    const validation = new ValidationError('Business rule violated', validationDetails);
    expect(validation.details).toEqual(validationDetails);
  });

  // T5: error.name -> igual ao nome da classe
  it('T5: matches error.name to the respective class name', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new UnauthorizedError().name).toBe('UnauthorizedError');
    expect(new ForbiddenError().name).toBe('ForbiddenError');
    expect(new ConflictError().name).toBe('ConflictError');
    expect(new ValidationError().name).toBe('ValidationError');
  });
});
