import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  port: Number(process.env.PORT) || 5000,
  mongoUrl: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/qshikshak',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  // School used when a request has no school (the frontend's top bar uses "one")
  defaultSchoolId: process.env.DEFAULT_SCHOOL_ID || 'one',
  // Comma-separated list of frontend URLs allowed to call the API
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3002').split(',').map((s) => s.trim()),
  // For testing without logging in: allow x-user-id / x-user-role headers outside production
  allowDevAuth: process.env.ALLOW_DEV_AUTH ? process.env.ALLOW_DEV_AUTH === 'true' : env !== 'production',
};

if (config.isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production.');
}