// Turns EVERY error into the same { success: false, data: null, message, errors? } answer.
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { config } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { fail } from '../utils/response.js';

// No route matched
export const notFoundRoute = (req: Request, res: Response): void => {
  fail(res, HTTP_STATUS.NOT_FOUND, `No API route for ${req.method} ${req.originalUrl}`);
};

interface HttpLikeError {
  type?: string;
  status?: number;
  code?: number;
}

// Express knows this is the error handler because it has 4 arguments – keep all 4.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    fail(res, err.status, err.message, err.errors);
    return;
  }
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = errors[0];
    fail(res, HTTP_STATUS.BAD_REQUEST, first ? `${first.field || 'Request'}: ${first.message}` : 'Invalid request.', errors);
    return;
  }
  // TokenExpiredError extends JsonWebTokenError – check it first
  if (err instanceof jwt.TokenExpiredError) {
    fail(res, HTTP_STATUS.UNAUTHORIZED, 'Your session has expired. Please log in again.');
    return;
  }
  if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.NotBeforeError) {
    fail(res, HTTP_STATUS.UNAUTHORIZED, 'Invalid login token. Please log in again.');
    return;
  }

  // Errors from the body parser
  const e = (err ?? {}) as HttpLikeError;
  if (e.type === 'entity.parse.failed') {
    fail(res, HTTP_STATUS.BAD_REQUEST, 'The request body is not valid JSON.');
    return;
  }
  if (e.type === 'entity.too.large') {
    fail(res, HTTP_STATUS.PAYLOAD_TOO_LARGE, `The request body is too large (max ${config.bodyLimit}).`);
    return;
  }
  if (e.type === 'encoding.unsupported' || e.type === 'charset.unsupported') {
    fail(res, HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, 'Unsupported request encoding.');
    return;
  }

  // MongoDB / Mongoose
  if (e.code === 11000) {
    fail(res, HTTP_STATUS.CONFLICT, 'This record already exists.');
    return;
  }
  if (err instanceof mongoose.Error.CastError || err instanceof mongoose.Error.ValidationError) {
    fail(res, HTTP_STATUS.BAD_REQUEST, err.message);
    return;
  }

  console.error(`[${config.serviceName}] ${req.id ?? '-'} ${req.method} ${req.originalUrl}`, err);
  const message = config.isProd ? 'Something went wrong on the server.' : err instanceof Error ? err.message : String(err);
  fail(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, message);
}
