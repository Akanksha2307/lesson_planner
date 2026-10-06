import { ZodError } from 'zod';
import { AppError } from './response.js';
import { config } from '../config/index.js';

export const notFoundRoute = (req, res) =>
  res.status(404).json({ success: false, data: null, message: `No API route for ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, data: null, message: err.message, errors: err.errors });
  }
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = errors[0];
    return res.status(400).json({
      success: false,
      data: null,
      message: first ? `${first.field || 'Request'}: ${first.message}` : 'Invalid request.',
      errors,
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, data: null, message: 'The request body is not valid JSON.' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ success: false, data: null, message: 'This record already exists.' });
  }
  if (err?.name === 'CastError' || err?.name === 'ValidationError') {
    return res.status(400).json({ success: false, data: null, message: err.message });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    data: null,
    message: config.isProd ? 'Something went wrong on the server.' : err.message,
  });
}