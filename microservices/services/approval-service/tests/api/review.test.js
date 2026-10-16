// POST /api/lesson-planner/plans/:id/review – through the real Express app,
// with a test database and FAKE auth-service and lesson-plan-service.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor } from "../helpers/setup.js";
import { demoPlan, daysAgo } from "../helpers/school.js";

let t;
const review = (planId, who, body) =>
  request(t.app).post(`/api/lesson-planner/plans/${planId}/review`).set("Authorization", who).send(body);

const HOD = tokenFor("t3", "hod");
const PRINCIPAL = tokenFor("p1", "principal");
const TEACHER = tokenFor("t1", "teacher");

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.stop();
});
beforeEach(() => {
  t.state.statusCalls.length = 0;
  t.state.plans.set("plan-1", demoPlan());
});

test("no login token → 401", async () => {
  const res = await request(t.app).post("/api/lesson-planner/plans/plan-1/review").send({ action: "approved" });
  assert.equal(res.status, 401);
});

test("a teacher cannot review → 403", async () => {
  const res = await review("plan-1", TEACHER, { action: "approved" });
  assert.equal(res.status, 403);
});

test("the principal is refused on a fresh plan, and the plan is not touched", async () => {
  const res = await review("plan-1", PRINCIPAL, { action: "approved" });
  assert.equal(res.status, 403);
  assert.match(res.body.message, /Anitha Rao \(HOD\) reviews this plan/);
  assert.equal(t.state.statusCalls.length, 0);
});

test("the HOD approves: plan changed, record saved, teacher notified", async () => {
  const res = await review("plan-1", HOD, { action: "approved", comment: "Good plan" });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, "Plan approved");

  // lesson-plan-service was asked to change the status
  assert.deepEqual(t.state.statusCalls[0], { schoolId: "one", status: "approved", reviewerId: "t3", comment: "Good plan" });
  assert.equal(t.state.plans.get("plan-1").status, "approved");

  // approval history
  const log = await request(t.app).get("/api/lesson-planner/approvals/log/plan-1").set("Authorization", HOD);
  assert.equal(log.status, 200);
  assert.equal(log.body.data.status, "APPROVED");
  assert.equal(log.body.data.history.at(-1).action, "HOD_APPROVED");

  // teacher's bell
  const bell = await request(t.app).get("/api/lesson-planner/notifications").set("Authorization", TEACHER);
  const note = bell.body.data.find((n) => n.title === "Plan approved");
  assert.ok(note, "teacher has a 'Plan approved' notification");
  assert.match(note.text, /Class 8-A Science plan was approved by Anitha Rao \(HOD\)/);
  assert.equal(note.link, "/lesson-planner/plans/plan-1");
});

test("reviewing twice → 409 'already reviewed by Anitha Rao'", async () => {
  t.state.plans.set("plan-1", demoPlan({ status: "approved", reviews: [{ by: "t3", action: "approved" }] }));
  const res = await review("plan-1", HOD, { action: "approved" });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already reviewed by Anitha Rao/);
});

test("sending back without a comment → 400", async () => {
  const res = await review("plan-1", HOD, { action: "returned" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Add a comment/);
  assert.equal(t.state.statusCalls.length, 0);
});

test("the HOD sends back with a comment: teacher sees the comment", async () => {
  t.state.plans.set("plan-2", demoPlan({ _id: "plan-2" }));
  const res = await review("plan-2", HOD, { action: "send-back", comment: "Add objectives" });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, "Plan sent back");
  assert.equal(t.state.plans.get("plan-2").status, "returned");

  const bell = await request(t.app).get("/api/lesson-planner/notifications").set("Authorization", TEACHER);
  const note = bell.body.data.find((n) => n.title === "Plan sent back");
  assert.match(note.text, /Add objectives/);
});

test("the principal approves a plan that waited 2 days, and the HOD is told", async () => {
  t.state.plans.set("plan-3", demoPlan({ _id: "plan-3", submittedAt: daysAgo(2) }));
  const res = await review("plan-3", PRINCIPAL, { action: "approved" });
  assert.equal(res.status, 200);

  const log = await request(t.app).get("/api/lesson-planner/approvals/log/plan-3").set("Authorization", HOD);
  assert.equal(log.body.data.history.at(-1).action, "PRINCIPAL_APPROVED");

  const hodBell = await request(t.app).get("/api/lesson-planner/notifications").set("Authorization", HOD);
  assert.ok(hodBell.body.data.some((n) => n.title === "Principal approved a plan"));
});

test("a plan of another school → 404", async () => {
  t.state.plans.set("plan-x", demoPlan({ _id: "plan-x", schoolId: "two" }));
  const res = await review("plan-x", HOD, { action: "approved" });
  assert.equal(res.status, 404);
});

test("an unknown plan → 404", async () => {
  const res = await review("no-such-plan", HOD, { action: "approved" });
  assert.equal(res.status, 404);
});

test("an invalid action → 400", async () => {
  const res = await review("plan-1", HOD, { action: "delete" });
  assert.equal(res.status, 400);
});

// keep this one last – it stops the fake lesson-plan-service
test("lesson-plan-service is down → 503 with a clear message", async () => {
  await t.stopLessonPlan();
  const res = await review("plan-1", HOD, { action: "approved" });
  assert.equal(res.status, 503);
  assert.match(res.body.message, /lesson-plan service is not reachable/);
});