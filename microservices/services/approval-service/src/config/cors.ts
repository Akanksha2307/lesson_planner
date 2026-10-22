// CORS: which websites may call this service from a browser. Others get no CORS headers,
// so the browser blocks the answer. Calls without an Origin (curl, other services) are not affected.
import type { CorsOptions } from 'cors';
import { config } from './env.js';

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, config.corsOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // The frontend sends the school, academic year and board on every request
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-School-Id', 'X-Academic-Year-Id', 'X-Board-Id'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
  maxAge: 600,
};
