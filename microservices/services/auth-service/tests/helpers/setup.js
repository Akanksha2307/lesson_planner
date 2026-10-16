// Starts everything one API test file needs, with NOTHING real outside this service:
//   - an in-memory MongoDB (or TEST_MONGO_URI if you set it), filled with the demo school
//   - a fake lesson-plan-service and a fake approval-service that record what auth sends them
//   - the auth-service Express app (no app.listen – supertest calls it directly)
import http from "node:http";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

export const INTERNAL_TOKEN = "test-internal-token";
export const JWT_SECRET = "test-jwt-secret";

function fakeService(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const send = (status, body) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(body));
        };
        if (req.headers["x-internal-token"] !== INTERNAL_TOKEN) return send(401, { success: false, message: "bad token" });
        handler(req, raw ? JSON.parse(raw) : {}, send);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

export async function startTestApp() {
  // --- settings (must be set BEFORE the app is imported) ---
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_TOKEN = INTERNAL_TOKEN;
  process.env.ALLOW_DEV_AUTH = "true";
  process.env.DEFAULT_SCHOOL_ID = "one";

  // --- fake other services (tests can read and change these) ---
  const state = {
    shiftCalls: [],
    notifyCalls: [],
    shiftAnswer: { affectedCount: 3, movedCount: 12, teacherIds: ["t1", "t2"], planIds: ["plan-1"] }
  };
  const lessonPlan = await fakeService((req, body, send) => {
    if (req.url === "/internal/holiday-shift") {
      state.shiftCalls.push(body);
      return send(200, { success: true, data: state.shiftAnswer });
    }
    send(404, { success: false, message: "not found" });
  });
  const approval = await fakeService((req, body, send) => {
    if (req.url === "/internal/notify") {
      state.notifyCalls.push(body);
      return send(201, { success: true, data: { created: body.to.length } });
    }
    send(404, { success: false, message: "not found" });
  });
  process.env.LESSON_PLAN_URL = `http://127.0.0.1:${lessonPlan.address().port}`;
  process.env.APPROVAL_URL = `http://127.0.0.1:${approval.address().port}`;

  // --- database with the demo school (staff t1, t3, p1, a1 … password demo123) ---
  let memory = null;
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `auth_test_${randomUUID().slice(0, 8)}` });
  const { seedDemoSchool } = await import("../../src/services/seed.service.js");
  await seedDemoSchool({ schoolId: "one" });

  const { default: app } = await import("../../src/app.js");

  return {
    app,
    state,
    stopLessonPlan: () => new Promise((r) => lessonPlan.close(r)),
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
      await Promise.all([lessonPlan, approval].map((s) => new Promise((r) => (s.listening ? s.close(r) : r()))));
      if (memory) await memory.stop();
    }
  };
}

// "YYYY-MM-DD" n days from today (India time, like the service)
export const dayFromToday = (n) => {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};