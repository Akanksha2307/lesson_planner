// Starts everything one API test file needs, with NOTHING real outside this service:
//   - an in-memory MongoDB (or TEST_MONGO_URI if you set it)
//   - a fake auth-service and a fake lesson-plan-service on random ports
//   - the approval-service Express app (no app.listen – supertest calls it directly)
import http from "node:http";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { demoSchool } from "./school.js";

export const INTERNAL_TOKEN = "test-internal-token";
export const JWT_SECRET = "test-jwt-secret";

// A login token like auth-service makes
export const tokenFor = (id, role, schoolId = "one") =>
  `Bearer ${jwt.sign({ sub: id, role, name: id, schoolId }, JWT_SECRET, { expiresIn: "1h" })}`;

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
  // --- database ---
  let memory = null;
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `approval_test_${randomUUID().slice(0, 8)}` });

  // --- fake other services (tests can change these) ---
  const state = {
    school: demoSchool(),
    plans: new Map(),
    statusCalls: []
  };

  const auth = await fakeService((req, body, send) => {
    if (req.url.startsWith("/internal/school/")) return send(200, { success: true, data: state.school });
    send(404, { success: false, message: "not found" });
  });

  const lessonPlan = await fakeService((req, body, send) => {
    const m = req.url.match(/^\/internal\/plans\/([^/]+)(\/status)?$/);
    if (!m) return send(404, { success: false, message: "not found" });
    const plan = state.plans.get(decodeURIComponent(m[1]));
    if (!plan) return send(404, { success: false, message: "Lesson plan not found" });
    if (req.method === "GET") return send(200, { success: true, data: { plan, items: [] } });
    if (req.method === "PATCH" && m[2]) {
      state.statusCalls.push(body);
      if (plan.status !== "submitted") return send(409, { success: false, message: "Only submitted plans can be reviewed" });
      plan.status = body.status;
      plan.reviews.push({ by: body.reviewerId, action: body.status, comment: body.comment });
      return send(200, { success: true, data: plan });
    }
    send(404, { success: false, message: "not found" });
  });

  // --- the app (env must be set BEFORE it is imported) ---
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_TOKEN = INTERNAL_TOKEN;
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${auth.address().port}`;
  process.env.LESSON_PLAN_URL = `http://127.0.0.1:${lessonPlan.address().port}`;
  process.env.CORS_ORIGIN = "http://localhost:3002";
  const { default: app } = await import("../../src/app.js");

  return {
    app,
    state,
    // Stop the fake lesson-plan-service (to test "service down")
    stopLessonPlan: () => new Promise((r) => lessonPlan.close(r)),
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
      await Promise.all([auth, lessonPlan].map((s) => new Promise((r) => (s.listening ? s.close(r) : r()))));
      if (memory) await memory.stop();
    }
  };
}