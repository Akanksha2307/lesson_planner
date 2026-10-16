// Login, /me and the internal school route – real app, test database, demo school.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, INTERNAL_TOKEN } from "../helpers/setup.js";

let t;
const login = (username, password) => request(t.app).post("/api/auth/login").send({ username, password });

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.stop();
});

test("t1 logs in with demo123 and gets a token + user (no password)", async () => {
  const res = await login("t1", "demo123");
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
  assert.deepEqual(res.body.data.user, { id: "t1", name: "Priya Sharma", role: "teacher", departmentId: "d-sci", schoolId: "one" });
  assert.equal(JSON.stringify(res.body).includes("passwordHash"), false);
});

test("the username is not case-sensitive", async () => {
  const res = await login("T1", "demo123");
  assert.equal(res.status, 200);
});

test("a wrong password → 401 with a general message", async () => {
  const res = await login("t1", "wrong");
  assert.equal(res.status, 401);
  assert.equal(res.body.message, "Wrong username or password.");
});

test("an unknown user gets the SAME message (does not reveal usernames)", async () => {
  const res = await login("nobody", "demo123");
  assert.equal(res.status, 401);
  assert.equal(res.body.message, "Wrong username or password.");
});

test("a missing password → 400", async () => {
  const res = await request(t.app).post("/api/auth/login").send({ username: "t1" });
  assert.equal(res.status, 400);
});

test("every demo role can log in", async () => {
  for (const [u, role] of [["t3", "hod"], ["p1", "principal"], ["a1", "admin"], ["pa1", "parent"]]) {
    const res = await login(u, "demo123");
    assert.equal(res.status, 200, `${u} logs in`);
    assert.equal(res.body.data.user.role, role);
  }
});

test("GET /me with the token gives the logged-in user", async () => {
  const { body } = await login("t3", "demo123");
  const res = await request(t.app).get("/api/auth/me").set("Authorization", `Bearer ${body.data.token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, "t3");
  assert.equal(res.body.data.name, "Anitha Rao");
});

test("GET /me without a token → 401", async () => {
  const res = await request(t.app).get("/api/auth/me");
  assert.equal(res.status, 401);
});

test("GET /me with a fake token → 401", async () => {
  const res = await request(t.app).get("/api/auth/me").set("Authorization", "Bearer not.a.token");
  assert.equal(res.status, 401);
});

test("/internal/school without the internal token → 403", async () => {
  const res = await request(t.app).get("/internal/school/one");
  assert.equal(res.status, 403);
});

test("/internal/school gives the whole school, staff without passwords", async () => {
  const res = await request(t.app).get("/internal/school/one").set("x-internal-token", INTERNAL_TOKEN);
  assert.equal(res.status, 200);
  const d = res.body.data;
  for (const key of ["classes", "sections", "subjects", "departments", "staff", "timetable", "holidays", "exams", "templates", "settings"]) {
    assert.ok(key in d, `has ${key}`);
  }
  assert.equal(d.departments.find((x) => x.id === "d-sci").hodId, "t3");
  assert.ok(d.staff.length > 0);
  assert.equal(JSON.stringify(d).includes("passwordHash"), false);
  assert.ok(d.settings.bellSchedule.length > 0);
});

test("GET /health → 200 and the database is connected", async () => {
  const res = await request(t.app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.data.db, "connected");
});