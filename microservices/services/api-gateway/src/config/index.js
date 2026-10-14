// All settings for api-gateway. Laptop: .env in the api-gateway folder. Docker: --env-file / environment.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) dotenv.config({ path: envFile, quiet: true });

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  serviceName: 'api-gateway',
  port: Number(process.env.PORT) || 5000,

  // The frontend's address(es) – only these may call the API from a browser
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3002').split(',').map((s) => s.trim()),

  // Where each service lives. Laptop: localhost. Docker: host.docker.internal or the compose service name.
  services: {
    auth: process.env.AUTH_URL || 'http://localhost:5001',
    lessonPlan: process.env.LESSON_PLAN_URL || 'http://localhost:5002',
    approval: process.env.APPROVAL_URL || 'http://localhost:5003',
  },
};