import { HTTP_STATUS } from '../constants/httpStatus.js';

// A "known" error: the message is safe to show to the user.
// Anything else that is thrown becomes a 500 with a general message.
export class AppError extends Error {
  readonly status: number;
  readonly errors?: unknown[];

  constructor(message: string, status: number = HTTP_STATUS.BAD_REQUEST, errors?: unknown[]) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.errors = errors;
  }
}

export const badRequest = (msg: string, errors?: unknown[]) => new AppError(msg, HTTP_STATUS.BAD_REQUEST, errors);
export const unauthorized = (msg = 'Please log in again.') => new AppError(msg, HTTP_STATUS.UNAUTHORIZED);
export const forbidden = (msg = 'You do not have permission to do this.') => new AppError(msg, HTTP_STATUS.FORBIDDEN);
export const notFound = (msg = 'Not found.') => new AppError(msg, HTTP_STATUS.NOT_FOUND);
export const conflict = (msg: string) => new AppError(msg, HTTP_STATUS.CONFLICT);
