// Import this FIRST in every test file: settings must exist before src/config/env.ts is loaded.
export const INTERNAL_TOKEN = 'test-internal-token-0123456789';
export const ACCESS_SECRET = 'test-access-secret-0123456789';
export const FRONTEND = 'http://localhost:3002';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
process.env.INTERNAL_TOKEN = INTERNAL_TOKEN;
process.env.CORS_ORIGINS = FRONTEND;
process.env.MONGODB_URI = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:1/not-used';
process.env.BODY_LIMIT = '10kb';
