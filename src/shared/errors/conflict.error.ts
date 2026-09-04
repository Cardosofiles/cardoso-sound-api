import { AppError } from './app-error.js';

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly error = 'Conflict';

  constructor(message = 'Resource already exists', details: unknown = null) {
    super(message, details);
  }
}
