// All settings for auth-service, in one place.
// On the laptop they come from .env (in the auth-service folder); in Docker from --env-file / environment.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) dotenv.config({ path: envFile, quiet: true });

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  serviceName: 'auth-service',
  port: Number(process.env.PORT) || 5001,

  // Atlas cluster address WITHOUT a database name + this service's own database
  mongoBaseUrl: process.env.MONGO_BASE_URL || 'mongodb://127.0.0.1:27017',
  dbName: process.env.DB_NAME || 'qshikshak_auth',

  // Login tokens – the same JWT_SECRET is used by every service to check tokens
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',

  // Other services send this in the x-internal-token header to call /internal/... routes
  internalToken: process.env.INTERNAL_TOKEN || 'dev-internal-token-change-me',

  defaultSchoolId: process.env.DEFAULT_SCHOOL_ID || 'one',
  // Other services auth-service calls (sudden holiday → lesson-plan moves lessons, approval sends the bell)
  lessonPlanUrl: process.env.LESSON_PLAN_URL || 'http://localhost:5002',
  approvalUrl: process.env.APPROVAL_URL || 'http://localhost:5003',
  // x-user-id / x-user-role test headers and demo login (never in real production)
  allowDevAuth: process.env.ALLOW_DEV_AUTH ? process.env.ALLOW_DEV_AUTH === 'true' : env !== 'production',
};

if (config.isProd && (config.jwtSecret.startsWith('dev-') || config.internalToken.startsWith('dev-'))) {
  throw new Error('Set JWT_SECRET and INTERNAL_TOKEN in production.');
}