// School data and settings – real app, test database, demo school.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp } from "../helpers/setup.js";

let t;
const token = {};

before(async () => {
  t = await startTestApp();
  for (const u of ["t1", "a1", "p1"]) {
    const r = await request(t.app).post("/api/auth/login").send({ username: u, password: "demo123" });
    token[u] = `Bearer ${r.body.data.token}`;
  }
});
after(async () => {
  await t.stop();
});

test("GET /masters gives the school data the frontend loads at start-up", async () => {
  const res = await request(t.app).get("/api/lesson-planner/masters").set("Authorization", token.t1);
  assert.equal(res.status, 200);
  const d = res.body.data;
  for (const key of ["classes", "sections", "subjects", "departments", "staff", "timetable", "holidays", "exams", "templates", "settings", "periods"]) {
    assert.ok(key in d, `has ${key}`);
  }
  assert.ok(d.periods.every((p) => p.type === "period"));
});

test("GET /masters staff list has no passwords or usernames", async () => {
  const res = await request(t.app).get("/api/lesson-planner/masters").set("Authorization", token.t1);
  assert.deepEqual(Object.keys(res.body.data.staff[0]).sort(), ["departmentId", "id", "name", "role"]);
});

test("GET /masters without a token → 401", async () => {
  const res = await request(t.app).get("/api/lesson-planner/masters");
  assert.equal(res.status, 401);
});

test("a teacher cannot change settings → 403", async () => {
  const res = await request(t.app).put("/api/lesson-planner/settings").set("Authorization", token.t1).send({ principalAfterDays: 5 });
  assert.equal(res.status, 403);
});

test("the admin changes principalAfterDays, and other services see it", async () => {
  const res = await request(t.app).put("/api/lesson-planner/settings").set("Authorization", token.a1).send({ principalAfterDays: 3 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.principalAfterDays, 3);

  const internal = await request(t.app).get("/internal/school/one").set("x-internal-token", "test-internal-token");
  assert.equal(internal.body.data.settings.principalAfterDays, 3);
});

test("an invalid setting → 400 with the field name", async () => {
  const res = await request(t.app).put("/api/lesson-planner/settings").set("Authorization", token.p1).send({ dailyReminderTime: "6pm" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /dailyReminderTime/);
});