// All settings for approval-service, read ONCE at start-up and checked with zod.
// A missing or wrong value stops the service with a clear message instead of failing later.
//   Laptop: values come from .env (next to package.json)   ·   Docker: env_file / environment
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
// Tests never read your personal .env (it has your real database and settings) – they set their own values
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) dotenv.config({ path: envFile, quiet: true });

const csv = z.string().transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5003),

  // Full MongoDB address INCLUDING the database name (…/qshikshak_approvals)
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (…mongodb.net/qshikshak_approvals?…)'),
  // Some home / office networks cannot resolve Atlas "mongodb+srv" addresses; these DNS servers are used for that
  DNS_SERVERS: csv.default(['8.8.8.8']),

  // Access tokens are made by auth-service; approval-service only CHECKS them.
  // Same value as JWT_ACCESS_SECRET in auth-service (JWT_SECRET is the older name).
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_ISSUER: z.string().default('qshikshak-auth'),
  JWT_AUDIENCE: z.string().default('qshikshak'),

  // Other services send this in the x-internal-token header to call /internal/... routes
  INTERNAL_TOKEN: z.string().min(16, 'INTERNAL_TOKEN must be at least 16 characters'),

  // Websites allowed to call the API from a browser (CORS_ORIGIN is the older name)
  CORS_ORIGINS: csv.optional(),
  CORS_ORIGIN: csv.optional(),
  BODY_LIMIT: z.string().default('1mb'),

  // lesson-plan-service: plans and the school data
  LESSON_PLAN_URL: z.url().default('http://localhost:5002'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`approval-service: invalid environment variables\n${lines}`);
}
const e = parsed.data;

const accessSecret = e.JWT_ACCESS_SECRET ?? e.JWT_SECRET;
if (!accessSecret) {
  throw new Error('approval-service: set JWT_ACCESS_SECRET (or JWT_SECRET) to the same value as JWT_ACCESS_SECRET in auth-service');
}

export const config = {
  env: e.NODE_ENV,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  serviceName: 'approval-service',
  port: e.PORT,

  mongoUri: e.MONGODB_URI,
  dnsServers: e.DNS_SERVERS,

  jwt: { accessSecret, issuer: e.JWT_ISSUER, audience: e.JWT_AUDIENCE },
  internalToken: e.INTERNAL_TOKEN,

  corsOrigins: e.CORS_ORIGINS ?? e.CORS_ORIGIN ?? ['http://localhost:3002'],
  bodyLimit: e.BODY_LIMIT,

  lessonPlanUrl: e.LESSON_PLAN_URL,
} as const;
