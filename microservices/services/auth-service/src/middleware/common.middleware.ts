// Everything every request goes through first, in this order:
//   request id → security headers → CORS → body parser (JSON / form) → content-type check → logging
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOptions } from '../config/cors.js';
import { config } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

// Every request gets an id (or keeps the one the gateway sent), so one call can be followed in the logs
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{1,100}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

// POST / PUT / PATCH with a body must send JSON (or a simple form). Anything else → 415.
export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && hasBody && !req.is(['application/json', 'application/x-www-form-urlencoded'])) {
    return next(new AppError('Send the body as JSON (Content-Type: application/json).', HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE));
  }
  next();
}

export function applyCommonMiddleware(app: Express): void {
  app.disable('x-powered-by');
  // Behind the gateway / Docker network: trust X-Forwarded-For only from private addresses
  app.set('trust proxy', 'loopback, uniquelocal');

  app.use(requestId);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.options('/{*any}', cors(corsOptions)); // pre-flight for every path

  // Body parser: JSON (and plain HTML forms), with a size limit
  app.use(express.json({ limit: config.bodyLimit, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));
  app.use(requireJsonBody);

  if (!config.isTest) {
    morgan.token('id', (req) => (req as Request).id ?? '-');
    app.use(morgan(`[${config.serviceName}] :id :method :url :status :response-time ms`));
  }
}
