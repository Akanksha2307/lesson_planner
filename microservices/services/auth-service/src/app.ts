// Builds the Express app (no listen here – server.ts starts it, tests import it directly).
//
// Order of every request:
//   1. common middleware   request id → helmet → CORS → body parser → content-type check → log
//   2. /health             no login (Docker and the gateway check it)
//   3. routes              secureRouter adds: authenticate (Bearer JWT) → role check   (config/routeRoles.ts)
//                          then each route adds: validate({ params, query, body }) → controller
//   4. 404, then the error handler (always { success: false, data: null, message })
import express from 'express';
import { config } from './config/env.js';
import { isDatabaseUp } from './config/database.js';
import { applyCommonMiddleware } from './middleware/common.middleware.js';
import { errorHandler, notFoundRoute } from './middleware/error.middleware.js';
import routes from './routes/index.js';
import { ok } from './utils/response.js';

const app = express();

applyCommonMiddleware(app);

app.get('/health', (_req, res) => {
  const db = isDatabaseUp() ? 'up' : 'down';
  res.status(db === 'up' ? 200 : 503);
  ok(res, { service: config.serviceName, db }, db === 'up' ? 'OK' : 'Database is not connected', res.statusCode);
});

app.use(routes);

app.use(notFoundRoute);
app.use(errorHandler);

export default app;
