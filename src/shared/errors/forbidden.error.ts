import { AppError } from './app-error.js';

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly error = 'Forbidden';

  constructor(message = 'Access forbidden', details: unknown = null) {
    super(message, details);
  }
}
