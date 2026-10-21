// Starts auth-service: connect to MongoDB, then listen on the port
import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

async function start(): Promise<void> {
  await connectDatabase();
  const server = app.listen(config.port, () => console.log(`[${config.serviceName}] running on http://localhost:${config.port}`));

  // Ctrl+C or "docker stop": stop taking new requests, finish the open ones, then close the DB
  const stop = (signal: string) => {
    console.log(`[${config.serviceName}] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // do not hang forever
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error(`[${config.serviceName}] unhandled promise rejection:`, reason);
});

start().catch((err: Error) => {
  console.error(`[${config.serviceName}] could not start:`, err.message);
  process.exit(1);
});
