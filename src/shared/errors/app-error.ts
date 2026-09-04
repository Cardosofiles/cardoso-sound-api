export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly error: string;

  constructor(
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}
