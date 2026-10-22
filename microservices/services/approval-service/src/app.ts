// Builds the Express app (no listen here – server.ts starts it, tests import it directly).
//
// Order of every request:
//   1. helmet → CORS → body parser (JSON, size limit)
//   2. /health                 no login (Docker and the gateway check it)
//   3. routes (route.config)   authenticate (Bearer JWT) → role check → validate → controller
//                              /internal: internalOnly (x-internal-token) → validate → controller
//   4. 404, then the error handler (always { success: false, data: null, message })
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOptions } from './config/cors.js';
import { isDatabaseUp } from './config/database.js';
import { config } from './config/env.js';
import { HTTP_STATUS } from './constants/httpStatus.js';
import { errorHandler, notFoundRoute } from './middleware/error.middleware.js';
import routes from './routes/index.js';
import { ok } from './utils/response.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: config.bodyLimit }));

app.get('/health', (_req, res) => {
  const up = isDatabaseUp();
  ok(res, { service: config.serviceName, db: up ? 'up' : 'down' }, up ? 'OK' : 'Database is not connected', up ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE);
});

app.use(routes);

app.use(notFoundRoute);
app.use(errorHandler);

export default app;
