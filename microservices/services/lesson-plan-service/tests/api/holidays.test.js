// Sudden holidays: the impact check and moving lessons (POST /internal/holiday-shift, called by auth-service).
// Moving lessons runs in a database TRANSACTION, so these tests need a replica set
// (setup.js starts one automatically).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor, mondayIn, INTERNAL_TOKEN, transactionsAvailable } from "../helpers/setup.js";

let t;
let planId;
const T1 = tokenFor("t1", "teacher");
const A1 = tokenFor("a1", "admin");
const start = mondayIn(90);
const addDays = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const items = async () => (await request(t.app).get(`/api/lesson-planner/plans/${planId}`).set("Authorization", T1)).body.data.items;
const shift = (body, token = INTERNAL_TOKEN) => request(t.app).post("/internal/holiday-shift").set("x-internal-token", token).send(body);
const needsTx = { skip: !transactionsAvailable() && "needs a replica set (TEST_TRANSACTIONS=no)" };

before(async () => {
  t = await startTestApp();
  const res = await request(t.app)
    .post("/api/lesson-planner/plans/generate")
    .set("Authorization", T1)
    .send({ classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, 5) });
  planId = res.body.data.plan.id;
});
after(async () => {
  await t.stop();
});

test("impact: counts the planned lessons on that day", async () => {
  const res = await request(t.app).get(`/api/lesson-planner/holidays/impact?date=${start}`).set("Authorization", A1);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.impact, 1, "t1 has one 8-A Science lesson on Monday");
});

test("impact: a day without lessons → 0", async () => {
  const res = await request(t.app).get(`/api/lesson-planner/holidays/impact?date=${addDays(start, 6)}`).set("Authorization", A1);
  assert.equal(res.body.data.impact, 0);
});

test("impact: no date → 400", async () => {
  const res = await request(t.app).get("/api/lesson-planner/holidays/impact").set("Authorization", A1);
  assert.equal(res.status, 400);
});

test("holiday-shift without the internal token → 401", async () => {
  const res = await request(t.app).post("/internal/holiday-shift").send({ schoolId: "one", date: start });
  assert.equal(res.status, 401);
});

test("holiday-shift with a bad date → 400", async () => {
  const res = await shift({ schoolId: "one", date: "19-10-2026" });
  assert.equal(res.status, 400);
});

test("holiday-shift for a past date → 400", async () => {
  const res = await shift({ schoolId: "one", date: "2020-01-06" });
  assert.equal(res.status, 400);
});

test("holiday-shift: the day's lesson and all later ones move one period on", needsTx, async () => {
  const before = (await items()).filter((i) => i.status === "planned").sort((a, b) => a.date.localeCompare(b.date));
  const res = await shift({ schoolId: "one", date: start });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.affectedCount, 1);
  assert.equal(res.body.data.movedCount, before.length, "every later lesson of that class moves");
  assert.deepEqual(res.body.data.teacherIds, ["t1"]);

  const after = await items();
  const planned = after.filter((i) => i.status === "planned").sort((a, b) => a.date.localeCompare(b.date));
  assert.equal(planned.some((i) => i.date === start), false, "nothing planned on the holiday");
  assert.equal(planned.length, before.length, "no lesson lost");
  assert.equal(planned[0].topicId, before[0].topicId, "the first topic now starts the next day");
  assert.equal(planned[0].date, addDays(start, 1));
  assert.equal(after.filter((i) => i.status === "rescheduled").length, before.length, "old positions kept as history");
});

test("holiday-shift on a day with no lessons → nothing moves", needsTx, async () => {
  const res = await shift({ schoolId: "one", date: addDays(start, 6) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.movedCount, 0);
});