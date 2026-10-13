// Starts the gateway on port 5000
import app from './app.js';
import { config } from './config/index.js';

const server = app.listen(config.port, () => {
  console.log(`[${config.serviceName}] running on http://localhost:${config.port}`);
  Object.entries(config.services).forEach(([name, url]) => console.log(`  ${name.padEnd(10)} → ${url}`));
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);