// Turns EVERY error into the same { success: false, data: null, message, errors? } answer.
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { fail } from '../utils/response.js';

export const notFoundRoute = (req: Request, res: Response): void => {
  fail(res, HTTP_STATUS.NOT_FOUND, `No API route for ${req.method} ${req.originalUrl}`);
};

// Express knows this is the error handler because it has 4 arguments – keep all 4.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) return fail(res, err.status, err.message, err.errors);
  if (err instanceof jwt.TokenExpiredError) return fail(res, HTTP_STATUS.UNAUTHORIZED, 'Your session has expired. Please log in again.');
  if (err instanceof jwt.JsonWebTokenError) return fail(res, HTTP_STATUS.UNAUTHORIZED, 'Invalid login token. Please log in again.');

  const e = (err ?? {}) as { type?: string };
  if (e.type === 'entity.parse.failed') return fail(res, HTTP_STATUS.BAD_REQUEST, 'The request body is not valid JSON.');
  if (e.type === 'entity.too.large') return fail(res, HTTP_STATUS.PAYLOAD_TOO_LARGE, `The request body is too large (max ${config.bodyLimit}).`);
  if (err instanceof mongoose.Error.CastError || err instanceof mongoose.Error.ValidationError) {
    return fail(res, HTTP_STATUS.BAD_REQUEST, err.message);
  }

  console.error(`[${config.serviceName}] ${req.method} ${req.originalUrl}`, err);
  fail(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, config.isProd ? 'Something went wrong on the server.' : err instanceof Error ? err.message : String(err));
}
