// Starts approval-service: connect to MongoDB, then listen on the port
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { config } from './config/env.js';

async function start(): Promise<void> {
  await connectDatabase();
  const server = app.listen(config.port, () => console.log(`[${config.serviceName}] running on http://localhost:${config.port}`));

  // Ctrl+C or "docker stop": finish open requests, then close the database
  const stop = (signal: string) => {
    console.log(`[${config.serviceName}] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

start().catch((err: Error) => {
  console.error(`[${config.serviceName}] could not start:`, err.message);
  process.exit(1);
});
