// All settings for auth-service, read ONCE at start-up and checked with zod.
// A missing or wrong value stops the service with a clear message instead of failing later.
//   Laptop: values come from .env (next to package.json)   ·   Docker: env_file / environment
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) dotenv.config({ path: envFile, quiet: true });

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');
const csv = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));
// "15m", "12h", "7d", "3600" (seconds) – the formats jsonwebtoken accepts
const duration = z.string().regex(/^\d+(s|m|h|d)?$/, 'Use a duration like 15m, 12h or 7d');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),

  // Atlas cluster address WITHOUT a database name + this service's own database
  MONGO_BASE_URL: z.string().min(1).default('mongodb://127.0.0.1:27017'),
  DB_NAME: z.string().min(1).default('qshikshak_auth'),

  // Access token: checked by EVERY service. Falls back to the old JWT_SECRET so the other
  // services keep working while they are being moved over.
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  JWT_SECRET: z.string().min(16).optional(),
  // Refresh token: only auth-service ever reads it
  JWT_REFRESH_SECRET: z.string().min(16).optional(),
  ACCESS_TOKEN_EXPIRES_IN: duration.default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: duration.default('7d'),
  JWT_ISSUER: z.string().default('qshikshak-auth'),
  JWT_AUDIENCE: z.string().default('qshikshak'),

  // Other services send this in the x-internal-token header to call /internal/... routes
  INTERNAL_TOKEN: z.string().min(16).optional(),

  CORS_ORIGINS: csv.default(['http://localhost:3002']),
  BODY_LIMIT: z.string().default('1mb'),
  // Login / refresh: max attempts per IP in 15 minutes
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(20),

  DEFAULT_SCHOOL_ID: z.string().default('one'),

  // x-user-id / x-user-role test headers and demo login (never in production)
  ALLOW_DEV_AUTH: bool.optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`auth-service: invalid environment variables\n${lines}`);
}
const e = parsed.data;
const isProd = e.NODE_ENV === 'production';

// Development-only fallbacks, so `npm run dev` works without a .env. Production must set real values.
const devSecret = (name: string) => `dev-only-${name}-change-me-0000`;
const accessSecret = e.JWT_ACCESS_SECRET ?? e.JWT_SECRET ?? devSecret('access');
const refreshSecret = e.JWT_REFRESH_SECRET ?? devSecret('refresh');
const internalToken = e.INTERNAL_TOKEN ?? devSecret('internal');
const allowDevAuth = e.ALLOW_DEV_AUTH ?? !isProd;

if (isProd) {
  const problems: string[] = [];
  if (accessSecret.startsWith('dev-only')) problems.push('JWT_ACCESS_SECRET is not set');
  if (refreshSecret.startsWith('dev-only')) problems.push('JWT_REFRESH_SECRET is not set');
  if (internalToken.startsWith('dev-only')) problems.push('INTERNAL_TOKEN is not set');
  if (accessSecret === refreshSecret) problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  if (allowDevAuth) problems.push('ALLOW_DEV_AUTH must be false in production');
  if (problems.length) throw new Error(`auth-service: unsafe production settings\n  - ${problems.join('\n  - ')}`);
}

export const config = {
  env: e.NODE_ENV,
  isProd,
  isTest: e.NODE_ENV === 'test',
  serviceName: 'auth-service',
  port: e.PORT,

  mongoBaseUrl: e.MONGO_BASE_URL,
  dbName: e.DB_NAME,

  jwt: {
    accessSecret,
    refreshSecret,
    accessExpiresIn: e.ACCESS_TOKEN_EXPIRES_IN,
    refreshExpiresIn: e.REFRESH_TOKEN_EXPIRES_IN,
    issuer: e.JWT_ISSUER,
    audience: e.JWT_AUDIENCE,
  },
  internalToken,

  corsOrigins: e.CORS_ORIGINS,
  bodyLimit: e.BODY_LIMIT,
  loginRateLimit: e.LOGIN_RATE_LIMIT,

  defaultSchoolId: e.DEFAULT_SCHOOL_ID,
  allowDevAuth,
} as const;

export type Config = typeof config;