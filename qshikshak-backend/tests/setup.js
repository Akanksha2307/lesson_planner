// Each test file gets its own empty database.
// Uses TEST_MONGO_URL if set (e.g. a local MongoDB), otherwise starts an in-memory MongoDB.
import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
let memory;

beforeAll(async () => {
  let url = process.env.TEST_MONGO_URL;
  if (!url) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    url = memory.getUri();
  }
  const dbName = `qshikshak_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await mongoose.connect(url, { dbName });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (memory) await memory.stop();
});
