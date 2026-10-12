// Builds the Express app (no listen here – server.js starts it, tests can import it)
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import { isDatabaseUp } from './config/database.js';
import { errorHandler, notFoundRoute } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
if (config.env !== 'test') app.use(morgan(`[${config.serviceName}] :method :url :status :response-time ms`));

// Docker and the gateway check this
app.get('/health', (req, res) =>
  res.json({ success: true, data: { service: config.serviceName, db: isDatabaseUp() ? 'connected' : 'disconnected' }, message: 'OK' }),
);

app.use(routes);

app.use(notFoundRoute);
app.use(errorHandler);

export default app;