import { AppError } from './app-error.js';

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly error = 'Not Found';

  constructor(message = 'Resource not found', details: unknown = null) {
    super(message, details);
  }
}
