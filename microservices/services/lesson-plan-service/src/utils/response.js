export const ok = (res, data, message = 'OK', status = 200) => res.status(status).json({ success: true, data, message });

export class AppError extends Error {
  constructor(message, status = 400, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const badRequest = (msg, errors) => new AppError(msg, 400, errors);
export const unauthorized = (msg = 'Please log in again.') => new AppError(msg, 401);
export const forbidden = (msg = 'You do not have permission to do this.') => new AppError(msg, 403);
export const notFound = (msg = 'Not found.') => new AppError(msg, 404);
export const conflict = (msg) => new AppError(msg, 409);