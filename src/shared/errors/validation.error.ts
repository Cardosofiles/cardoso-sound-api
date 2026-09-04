import { AppError } from './app-error.js';

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly error = 'Unprocessable Entity';

  constructor(message = 'Validation failed', details: unknown = null) {
    super(message, details);
  }
}
