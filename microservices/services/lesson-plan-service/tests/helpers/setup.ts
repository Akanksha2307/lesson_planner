// Starts everything one API test file needs, with NOTHING real outside this service:
//   - an in-memory MongoDB REPLICA SET (needed for transactions), or TEST_MONGO_URI if you set it
//   - the school data: by default the demo school from tests/helpers/school.json (t.state.school, editable);
//     with { realSchool: true } the demo school is seeded into the database and the REAL school code runs
//   - the lesson-plan-service Express app (no app.listen – supertest calls it directly)
import http from "node:http";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

export const INTERNAL_TOKEN = "test-internal-token";
export const JWT_SECRET = "test-jwt-secret";

const fixture = (name: any) => JSON.parse(readFileSync(path.join(__dirname, name), "utf8"));
export const demoSchool = () => fixture("school.json");
export const demoSyllabus = () => fixture("syllabus-c8-sci.json");

// A login token like auth-service makes

// Generate a test access token matching the Auth Service JWT contract.
export const tokenFor = (
  id: string,
  role: string,
  schoolId = "one"
): string => {
  const token = jwt.sign(
    {
      sub: id,
      role,
      name: id,
      schoolId,
      type: "access"
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: "qshikshak-auth",
      audience: "qshikshak",
      expiresIn: "1h"
    }
  );

  return `Bearer ${token}`;
};

// Transactions (holiday shift, cancel/move/swap …) need a replica set.
// With TEST_MONGO_URI pointing at a plain server, set TEST_TRANSACTIONS=no to skip those tests.
export const transactionsAvailable = () => process.env.TEST_TRANSACTIONS !== "no";

export async function startTestApp({ realSchool = false } = {}) {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_TOKEN = INTERNAL_TOKEN;
  process.env.DEFAULT_SCHOOL_ID = "one";

  const state: any = {
    school: demoSchool(),
    schoolCalls: 0,
    shiftCalls: [],
    notifyCalls: [],
    shiftAnswer: { affectedCount: 3, movedCount: 12, teacherIds: ["t1", "t2"], planIds: ["plan-1"] },
    shiftFails: false
  };

  // --- fake approval-service (records the notifications) – only with the real school ---
  let approval: http.Server | null = null;
  if (realSchool) {
    approval = await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          const send = (status: number, body: any) => {
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify(body));
          };
          if (req.headers["x-internal-token"] !== INTERNAL_TOKEN) return send(401, { success: false, message: "bad token" });
          const body = raw ? JSON.parse(raw) : {};
          if (req.url === "/internal/notify") {
            state.notifyCalls.push(body);
            return send(201, { success: true, data: { created: body.to.length } });
          }
          send(404, { success: false, message: "not found" });
        });
      });
      server.listen(0, "127.0.0.1", () => resolve(server));
    });
    process.env.APPROVAL_URL = `http://127.0.0.1:${(approval!.address() as import("node:net").AddressInfo).port}`;
  }

  // --- database ---
  let memory = null;
  let uri = process.env.TEST_MONGO_URI as string;
  if (!uri) {
    const { MongoMemoryReplSet } = require("mongodb-memory-server");
    memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `lessonplan_test_${randomUUID().slice(0, 8)}` });

  // The syllabus for Class 8 Science (lesson-plan-service owns syllabi)
  const { Syllabus } = require("../../src/models/syllabus.model");
  const syl = demoSyllabus();
  await Syllabus.create({
    _id: syl.id,
    schoolId: "one",
    classId: syl.classId,
    subjectId: syl.subjectId,
    board: syl.board,
    chapters: syl.chapters.map(({ id, topics, ...ch }: any) => ({ _id: id, ...ch, topics: topics.map(({ id: tid, ...tp }: any) => ({ _id: tid, ...tp })) }))
  });

  if (realSchool) {
    // The demo school goes into the database; planning reads it through the real school code.
    await require("../../src/services/seed.service").seedDemoSchool({ schoolId: "one" });
    // Moving lessons is a different test file's job – record the call and answer like the real one
    const holidayShift = require("../../src/services/holiday-shift.service");
    mock.method(holidayShift, "shiftLessonsForHoliday", async (schoolId: string, date: string) => {
      state.shiftCalls.push({ schoolId, date });
      if (state.shiftFails) throw new Error("shift failed");
      return state.shiftAnswer;
    });
  } else {
    // Planning reads the school from the in-memory demo school (t.state.school)
    mock.method(require("../../src/services/school-client.service"), "getSchoolData", async () => {
      state.schoolCalls++;
      return state.school;
    });
  }

  const { default: app } = require("../../src/app");

  return {
    app,
    state,
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
      if (approval) await new Promise((r) => approval!.close(r));
      if (memory) await memory.stop();
    }
  };
}

// The Monday about n days from today, as "YYYY-MM-DD" (server local time, like the service)
export function mondayIn(days: any) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}