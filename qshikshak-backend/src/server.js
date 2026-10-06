import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDb, disconnectDb } from './config/db.js';

async function start() {
  await connectDb();
  console.log('MongoDB connected');

  const server = createApp().listen(config.port, () =>
    console.log(`Qshikshak backend running on http://localhost:${config.port}/api`),
  );

  const stop = async () => {
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

start().catch((err) => {
  console.error('Could not start the server:', err.message);
  process.exit(1);
});