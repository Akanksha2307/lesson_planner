// Starts auth-service: connect to MongoDB, then listen on the port
import app from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

try {
  await connectDatabase();
  const server = app.listen(config.port, () => console.log(`[${config.serviceName}] running on http://localhost:${config.port}`));

  // Ctrl+C or "docker stop": close cleanly
  const stop = async () => {
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (err) {
  console.error(`[${config.serviceName}] could not start:`, err.message);
  process.exit(1);
}