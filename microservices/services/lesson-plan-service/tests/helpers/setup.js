// Starts everything one API test file needs, with NOTHING real outside this service:
//   - an in-memory MongoDB REPLICA SET (needed for transactions), or TEST_MONGO_URI if you set it
//   - a fake auth-service that answers /internal/school/:schoolId with the demo school
//   - the lesson-plan-service Express app (no app.listen – supertest calls it directly)
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

export const INTERNAL_TOKEN = "test-internal-token";
export const JWT_SECRET = "test-jwt-secret";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
export const demoSchool = () => fixture("school.json");
export const demoSyllabus = () => fixture("syllabus-c8-sci.json");

// A login token like auth-service makes
export const tokenFor = (id, role, schoolId = "one") =>
  `Bearer ${jwt.sign({ sub: id, role, name: id, schoolId }, JWT_SECRET, { expiresIn: "1h" })}`;

// Transactions (holiday shift, cancel/move/swap …) need a replica set.
// With TEST_MONGO_URI pointing at a plain server, set TEST_TRANSACTIONS=no to skip those tests.
export const transactionsAvailable = () => process.env.TEST_TRANSACTIONS !== "no";

export async function startTestApp() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_TOKEN = INTERNAL_TOKEN;
  process.env.DEFAULT_SCHOOL_ID = "one";

  // --- fake auth-service ---
  const state = { school: demoSchool(), schoolCalls: 0 };
  const auth = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.headers["x-internal-token"] !== INTERNAL_TOKEN) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ success: false, message: "Internal route." }));
      }
      if (req.url.startsWith("/internal/school/")) {
        state.schoolCalls++;
        return res.end(JSON.stringify({ success: true, data: state.school }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: "not found" }));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${auth.address().port}`;

  // --- database ---
  let memory = null;
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `lessonplan_test_${randomUUID().slice(0, 8)}` });

  // The syllabus for Class 8 Science (lesson-plan-service owns syllabi)
  const { Syllabus } = await import("../../src/models/syllabus.model.js");
  const syl = demoSyllabus();
  await Syllabus.create({
    _id: syl.id,
    schoolId: "one",
    classId: syl.classId,
    subjectId: syl.subjectId,
    board: syl.board,
    chapters: syl.chapters.map(({ id, topics, ...ch }) => ({ _id: id, ...ch, topics: topics.map(({ id: tid, ...tp }) => ({ _id: tid, ...tp })) }))
  });

  const { default: app } = await import("../../src/app.js");

  return {
    app,
    state,
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
      await new Promise((r) => auth.close(r));
      if (memory) await memory.stop();
    }
  };
}

// The Monday about n days from today, as "YYYY-MM-DD" (server local time, like the service)
export function mondayIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}