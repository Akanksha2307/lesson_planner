import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDb, disconnectDb } from './config/db.js';
import { remindPrincipals } from './modules/notifications/notifications.service.js';

async function start() {
  await connectDb();
  console.log('MongoDB connected');

  const server = createApp().listen(config.port, () =>
    console.log(`Qshikshak backend running on http://localhost:${config.port}/api`),
  );

  // Every hour: tell the principal about plans the HOD has not reviewed in time
  const remind = () => remindPrincipals().catch((err) => console.error('Reminder check failed:', err.message));
  remind();
  const timer = setInterval(remind, 60 * 60 * 1000);

  const stop = async () => {
    clearInterval(timer);
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