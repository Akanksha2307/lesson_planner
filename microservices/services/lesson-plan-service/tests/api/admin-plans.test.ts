// Admin plans: the admin assigns a plan to a teacher (teacher, class, subject, which topics,
// dates, note), previews it first, may rearrange it while it is a draft, and only the teacher submits.
// Real app + test database; the school is the in-memory demo school (t.state.school).
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor, mondayIn } from "../helpers/setup";

let t: any;
let planId: string;
const notes: any[] = [];
const ADMIN = tokenFor("a1", "admin");
const T1 = tokenFor("t1", "teacher");
const T2 = tokenFor("t2", "teacher");
const PRINCIPAL = tokenFor("p1", "principal");
const start = mondayIn(120); // far from the other test files' weeks
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const week = { classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, 5) };
const api = (method: "get" | "post" | "patch", path: string, who: string) =>
  (request(t.app) as any)[method](`/api/lesson-planner${path}`).set("Authorization", who);

before(async () => {
  t = await startTestApp();
  // Record the teacher's bell instead of calling approval-service
  mock.method(require("../../src/services/notification-client.service"), "notify", async (...args: any[]) => {
    notes.push(args);
    return { created: 1 };
  });
});
after(async () => {
  await t.stop();
});

test("admin without a teacher → 400 'Choose the teacher'", async () => {
  const res = await api("post", "/plans/generate", ADMIN).send(week);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Choose the teacher/);
});

test("admin cannot assign a plan to a non-teacher (the HOD) → 400", async () => {
  const res = await api("post", "/plans/generate", ADMIN).send({ ...week, teacherId: "t3" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /active teacher/);
});

test("a teacher cannot choose topics or add a note → 403", async () => {
  const res = await api("post", "/plans/generate", T1).send({ ...week, topicIds: ["tp-0-1-0"] });
  assert.equal(res.status, 403);
});

test("the principal cannot create plans → 403", async () => {
  const res = await api("post", "/plans/generate", PRINCIPAL).send({ ...week, teacherId: "t1" });
  assert.equal(res.status, 403);
});

test("an unknown topic → 400", async () => {
  const res = await api("post", "/plans/preview", ADMIN).send({ ...week, teacherId: "t1", topicIds: ["nope"] });
  assert.equal(res.status, 400);
});

test("preview: chosen topics in the chosen order, per-plan periods, nothing saved", async () => {
  const res = await api("post", "/plans/preview", ADMIN).send({
    ...week,
    teacherId: "t1",
    topicIds: ["tp-0-1-1", "tp-0-1-0"], // Microorganisms topic 2 first, then topic 1
    topicPeriods: { "tp-0-1-0": 1 }
  });
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.deepEqual(d.lessons.map((l: any) => l.topicId), ["tp-0-1-1", "tp-0-1-0"]);
  assert.equal(d.lessons[0].date, start);
  assert.equal(d.freeSlots, 6, "t1 teaches 8-A Science once a day, Mon–Sat");
  assert.equal(d.neededPeriods, 2);
  assert.deepEqual(d.unscheduled, []);

  const list = await api("get", "/plans?teacherId=t1", ADMIN);
  assert.equal(list.body.data.length, 0, "preview saved nothing");
});

test("admin creates the plan for t1 → draft, owned by t1, note kept, t1 is notified", async () => {
  const res = await api("post", "/plans/generate", ADMIN).send({
    ...week,
    teacherId: "t1",
    topicIds: ["tp-0-1-0", "tp-0-1-1"],
    note: "Include a hands-on activity."
  });
  assert.equal(res.status, 201);
  const plan = res.body.data.plan;
  planId = plan.id;
  assert.equal(plan.teacherId, "t1");
  assert.equal(plan.status, "draft");
  assert.equal(plan.createdBy, "a1");
  assert.equal(plan.assignedByAdmin, true);
  assert.equal(plan.note, "Include a hands-on activity.");
  assert.equal(res.body.data.placedCount, 3, "2 + 1 periods");

  const assigned = notes.filter((n) => n[2] === "New plan assigned to you");
  assert.equal(assigned.length, 1);
  const [schoolId, to, title, text, link] = assigned[0];
  assert.equal(schoolId, "one");
  assert.deepEqual(to, ["t1"]);
  assert.equal(title, "New plan assigned to you");
  assert.match(text, /hands-on activity/);
  assert.equal(link, `/lesson-planner/plans/${planId}`);
});

test("t1 sees the assigned plan in her own list", async () => {
  const res = await api("get", "/plans", T1);
  const mine = res.body.data.find((p: any) => p.id === planId);
  assert.ok(mine, "the plan is in t1's list");
  assert.equal(mine.assignedByAdmin, true);
});

test("another teacher cannot see it", async () => {
  const res = await api("get", `/plans/${planId}`, T2);
  assert.ok([403, 404].includes(res.status), `got ${res.status}`);
});

test("admin can swap two lessons of the draft plan", async () => {
  const items = (await api("get", `/plans/${planId}`, ADMIN)).body.data.items;
  const [a, b] = items;
  const res = await api("post", "/plan-items/swap", ADMIN).send({ firstItemId: a.id, secondItemId: b.id });
  assert.equal(res.status, 200, res.body.message);
  assert.equal(res.body.data.first.date, b.date);
  assert.equal(res.body.data.second.date, a.date);
});

test("the admin cannot submit – only the teacher → 403", async () => {
  const res = await api("post", `/plans/${planId}/submit`, ADMIN);
  assert.equal(res.status, 403);
});

test("t1 submits the plan → her HOD is notified", async () => {
  const res = await api("post", `/plans/${planId}/submit`, T1);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "submitted");
  const waiting = notes.filter((n) => n[2] === "Plan waiting for approval");
  assert.equal(waiting.length, 1);
  assert.deepEqual(waiting[0][1], ["t3"], "t3 is the Science HOD");
});

test("once submitted, the admin cannot rearrange it → 409", async () => {
  const items = (await api("get", `/plans/${planId}`, ADMIN)).body.data.items;
  const res = await api("post", "/plan-items/swap", ADMIN).send({ firstItemId: items[0].id, secondItemId: items[1].id });
  assert.equal(res.status, 409);
});

test("a teacher still creates her own plans as before (no topics, no note)", async () => {
  const res = await api("post", "/plans/generate", T1).send({ ...week, startDate: addDays(start, 7), endDate: addDays(start, 12) });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.plan.createdBy, "t1");
  assert.equal(res.body.data.plan.assignedByAdmin, false);
  const assigned = notes.filter((n) => n[2] === "New plan assigned to you");
  assert.equal(assigned.length, 1, "no new 'assigned' notification when the teacher plans for herself");
});