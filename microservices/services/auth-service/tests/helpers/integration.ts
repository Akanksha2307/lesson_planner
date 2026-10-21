// Starts what one integration test file needs, with NOTHING real outside this service:
//   - an in-memory MongoDB (or TEST_MONGO_URI if you set it)
//   - the auth-service Express app (no listen – supertest calls it directly)
//   - demo logins, created the same way lesson-plan-service creates them: PUT /internal/accounts
// mongodb-memory-server downloads a MongoDB binary the first time (needs internet once).
import { INTERNAL_TOKEN } from './env.js';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { DEMO_ACCOUNTS } from '../../scripts/demo-accounts.js';

export { INTERNAL_TOKEN };

export { DEMO_ACCOUNTS };

export async function startTestApp() {
  let memory: { getUri(): string; stop(): Promise<boolean> } | null = null;
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `auth_test_${randomUUID().slice(0, 8)}` });
  const { default: app } = await import('../../src/app.js');

  const seeded = await request(app).put('/internal/accounts').set('x-internal-token', INTERNAL_TOKEN).send({ schoolId: 'one', accounts: DEMO_ACCOUNTS });
  if (seeded.status !== 200) throw new Error(`could not create demo logins: ${JSON.stringify(seeded.body)}`);

  return {
    app,
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
      if (memory) await memory.stop();
    },
  };
}