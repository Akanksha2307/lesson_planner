// CORS: which websites (origins) may call this service from a browser.
// Only the origins in CORS_ORIGINS get CORS headers; any other website is blocked by the browser.
// Requests without an Origin header (curl, Postman, other services) are not affected by CORS.
import type { CorsOptions } from 'cors';
import { config } from './env.js';

export const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
    // The frontend sends these three on EVERY request (school · academic year · board in the top bar).
  // auth-service only reads X-School-Id at login, but the browser blocks the call if any is not allowed.
  'X-School-Id',
  'X-Academic-Year-Id',
  'X-Board-Id',
  // Development test headers (only read when ALLOW_DEV_AUTH=true)
  'X-User-Id',
  'X-User-Role',
];

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin → not a browser cross-site call
    if (!origin) return callback(null, true);
    // false = no CORS headers → the browser refuses the answer. No error, no 500.
    return callback(null, config.corsOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ALLOWED_HEADERS,
  exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  credentials: true,
  maxAge: 600, // the browser may cache the pre-flight answer for 10 minutes
};