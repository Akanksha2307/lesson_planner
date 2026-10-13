// The gateway: the ONLY address the frontend knows (http://localhost:5000/api).
// It does not log anyone in itself – each service checks the token (they share JWT_SECRET).
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import { blockInternal, errorHandler, notFoundRoute } from './middleware/errorHandler.js';
import { forwardToService } from './middleware/proxy.js';
import healthRoutes from './routes/health.routes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
if (config.env !== 'test') app.use(morgan(`[${config.serviceName}] :method :url → :status :response-time ms`));

// Note: no express.json() here – the body is passed on to the service untouched
app.get('/health', (req, res) => res.json({ success: true, data: { service: config.serviceName }, message: 'OK' }));
app.use(healthRoutes);
app.use('/internal', blockInternal);
app.use(forwardToService);

app.use(notFoundRoute);
app.use(errorHandler);

export default app;