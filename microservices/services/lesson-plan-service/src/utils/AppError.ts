export class AppError extends Error {
  public statusCode: number;
  // `status` is kept because services and the error handler have always read it
  public status: number;
  public errors?: unknown;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400, errors?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest = (msg: string, errors?: unknown) => new AppError(msg, 400, errors);
export const unauthorized = (msg = "Please log in again.") => new AppError(msg, 401);
export const forbidden = (msg = "You do not have permission to do this.") => new AppError(msg, 403);
export const notFound = (msg = "Not found.") => new AppError(msg, 404);
export const conflict = (msg: string) => new AppError(msg, 409);
