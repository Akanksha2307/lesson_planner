// Starts everything one API test file needs, with NOTHING real outside this service:
//   - an in-memory MongoDB (or TEST_MONGO_URI if you set it)
//   - a fake lesson-plan-service (plans AND school data) on a random port
//   - the approval-service Express app (no listen – supertest calls it directly)
import { INTERNAL_TOKEN } from './env.js';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { demoSchool, type demoPlan } from './school.js';

export { INTERNAL_TOKEN };
export { tokenFor } from './tokens.js';

type Send = (status: number, body: unknown) => void;

function fakeService(handler: (req: http.IncomingMessage, body: any, send: Send) => void): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const send: Send = (status, body) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        };
        if (req.headers['x-internal-token'] !== INTERNAL_TOKEN) return send(401, { success: false, message: 'bad token' });
        handler(req, raw ? JSON.parse(raw) : {}, send);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export async function startTestApp() {
  let memory: { getUri(): string; stop(): Promise<boolean> } | null = null;
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `approval_test_${randomUUID().slice(0, 8)}` });

  const state = {
    school: demoSchool(),
    plans: new Map<string, ReturnType<typeof demoPlan>>(),
    statusCalls: [] as Array<Record<string, unknown>>,
  };

  const lessonPlan = await fakeService((req, body, send) => {
    const url = req.url ?? '';
    if (url.startsWith('/internal/school/')) return send(200, { success: true, data: state.school });
    const m = url.match(/^\/internal\/plans\/([^/]+)(\/status)?$/);
    if (!m) return send(404, { success: false, message: 'not found' });
    const plan = state.plans.get(decodeURIComponent(m[1]!));
    if (!plan) return send(404, { success: false, message: 'Lesson plan not found' });
    if (req.method === 'GET') return send(200, { success: true, data: { plan, items: [] } });
    if (req.method === 'PATCH' && m[2]) {
      state.statusCalls.push(body);
      if (plan.status !== 'submitted') return send(409, { success: false, message: 'Only submitted plans can be reviewed' });
      plan.status = body.status;
      plan.reviews.push({ by: body.reviewerId, action: body.status, comment: body.comment });
      return send(200, { success: true, data: plan });
    }
    send(404, { success: false, message: 'not found' });
  });
  process.env.LESSON_PLAN_URL = `http://127.0.0.1:${(lessonPlan.address() as AddressInfo).port}`;

  // Imported AFTER the URL above is set, so config picks it up
  const { default: app } = await import('../../src/app.js');

  return {
    app,
    state,
    // Stop the fake lesson-plan-service (to test "service down")
    stopLessonPlan: () => new Promise<void>((r) => lessonPlan.close(() => r())),
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
      await new Promise<void>((r) => (lessonPlan.listening ? lessonPlan.close(() => r()) : r()));
      if (memory) await memory.stop();
    },
  };
}
