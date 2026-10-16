// Plans: generate → submit, and the /internal routes approval-service uses.
// Real app + test database; auth-service is a FAKE that returns the demo school.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor, mondayIn, INTERNAL_TOKEN } from "../helpers/setup.js";

let t;
let planId;
const T1 = tokenFor("t1", "teacher");
const T2 = tokenFor("t2", "teacher");
const PARENT = tokenFor("pa1", "parent");
const start = mondayIn(60);
const addDays = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const generate = (who, body) => request(t.app).post("/api/lesson-planner/plans/generate").set("Authorization", who).send(body);
const internal = (method, path) => request(t.app)[method](`/internal${path}`).set("x-internal-token", INTERNAL_TOKEN);

before(async () => {
  t = await startTestApp();
  // a holiday on the Wednesday of the test week
  t.state.school.holidays.push({ date: addDays(start, 2), title: "Test holiday" });
});
after(async () => {
  await t.stop();
});

test("no login token → 401", async () => {
  const res = await request(t.app).get("/api/lesson-planner/plans");
  assert.equal(res.status, 401);
});

test("a parent cannot see plans → 403", async () => {
  const res = await request(t.app).get("/api/lesson-planner/plans").set("Authorization", PARENT);
  assert.equal(res.status, 403);
});

test("t1 generates a week's plan from the syllabus + her timetable", async () => {
  const res = await generate(T1, { classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, 5) });
  assert.equal(res.status, 201);
  planId = res.body.data.plan.id;
  assert.ok(planId);
  // t1 teaches 8-A Science once every day Mon–Sat; Wednesday is a holiday → 5 lessons
  assert.equal(res.body.data.placedCount, 5);
  assert.deepEqual(res.body.data.skippedDays, [addDays(start, 2)]);
});

test("the plan's lessons follow the syllabus order and the timetable", async () => {
  const res = await request(t.app).get(`/api/lesson-planner/plans/${planId}`).set("Authorization", T1);
  assert.equal(res.status, 200);
  const items = res.body.data.items;
  assert.equal(items.length, 5);
  assert.equal(items.some((i) => i.date === addDays(start, 2)), false, "nothing on the holiday");
  assert.equal(items[0].topicTitle, "Agricultural practices", "starts with the first topic");
  assert.equal(items[0].periodId, "p1", "Monday = period 1 in t1's timetable");
});

test("generating for a section that is not in the class → 400", async () => {
  const res = await generate(T1, { classId: "c7", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, 5) });
  assert.equal(res.status, 400);
});

test("end date before start date → 400", async () => {
  const res = await generate(T1, { classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, -1) });
  assert.equal(res.status, 400);
});

test("the same week again → 400 'Nothing to plan' (no double lessons)", async () => {
  const res = await generate(T1, { classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, 5) });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Nothing to plan/);
});

test("another teacher cannot open t1's plan", async () => {
  const res = await request(t.app).get(`/api/lesson-planner/plans/${planId}`).set("Authorization", T2);
  assert.ok([403, 404].includes(res.status), `got ${res.status}`);
});

test("t1 submits the plan → submitted; submitting again → 409", async () => {
  const res = await request(t.app).post(`/api/lesson-planner/plans/${planId}/submit`).set("Authorization", T1);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "submitted");

  const again = await request(t.app).post(`/api/lesson-planner/plans/${planId}/submit`).set("Authorization", T1);
  assert.equal(again.status, 409);
});

// ---------- /internal (used by approval-service) ----------

test("/internal/plans without the internal token → 401", async () => {
  const res = await request(t.app).get(`/internal/plans/${planId}`);
  assert.equal(res.status, 401);
});

test("/internal/plans/:id gives the plan and its lessons", async () => {
  const res = await internal("get", `/plans/${planId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.plan.status, "submitted");
  assert.equal(res.body.data.items.length, 5);
});

test("a bad status change → 400", async () => {
  const res = await internal("patch", `/plans/${planId}/status`).send({ status: "deleted", reviewerId: "t3", schoolId: "one" });
  assert.equal(res.status, 400);
});

test("approval-service approves → status + review saved", async () => {
  const res = await internal("patch", `/plans/${planId}/status`).send({ status: "approved", reviewerId: "t3", comment: "Good", schoolId: "one" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "approved");
  const review = res.body.data.reviews.at(-1);
  assert.equal(review.by, "t3");
  assert.equal(review.action, "approved");
  assert.equal(review.comment, "Good");
});

test("a second review of the same plan → 409 (first review wins)", async () => {
  const res = await internal("patch", `/plans/${planId}/status`).send({ status: "returned", reviewerId: "p1", comment: "x", schoolId: "one" });
  assert.equal(res.status, 409);
});

test("an unknown plan → 404", async () => {
  const res = await internal("get", "/plans/plan-nope");
  assert.equal(res.status, 404);
});

test("t1 can delete a plan whose lessons are not marked yet", async () => {
  const p = await generate(T1, { classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: addDays(start, 7), endDate: addDays(start, 12) });
  assert.equal(p.status, 201);
  const id = p.body.data.plan.id;
  const res = await request(t.app).delete(`/api/lesson-planner/plans/${id}`).set("Authorization", T1);
  assert.equal(res.status, 200);
  const gone = await internal("get", `/plans/${id}`);
  assert.equal(gone.status, 404);
});