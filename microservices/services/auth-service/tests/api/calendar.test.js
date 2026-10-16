// Holidays and exams – real app and test database; lesson-plan-service and
// approval-service are FAKES that record what auth-service asks them to do.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, dayFromToday, INTERNAL_TOKEN } from "../helpers/setup.js";

let t;
const token = {};
const api = (method, path, who) => request(t.app)[method](`/api/lesson-planner${path}`).set("Authorization", token[who]);
const school = async () => (await request(t.app).get("/internal/school/one").set("x-internal-token", INTERNAL_TOKEN)).body.data;

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
beforeEach(() => {
  t.state.shiftCalls.length = 0;
  t.state.notifyCalls.length = 0;
});

// ---------- Holidays ----------

test("everyone can list holidays (with both name and title)", async () => {
  const res = await api("get", "/holidays", "t1");
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
  assert.equal(res.body.data[0].name, res.body.data[0].title);
});

test("a teacher cannot add a holiday → 403", async () => {
  const res = await api("post", "/holidays", "t1").send({ name: "x", date: dayFromToday(40) });
  assert.equal(res.status, 403);
});

test("no name → 400", async () => {
  const res = await api("post", "/holidays", "a1").send({ date: dayFromToday(40) });
  assert.equal(res.status, 400);
});

test("a normal holiday: saved, everyone else notified, NO lessons moved", async () => {
  const date = dayFromToday(40);
  const res = await api("post", "/holidays", "a1").send({ name: "Diwali", date, description: "Festival" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, "Diwali");
  assert.equal(res.body.data.notified, true);

  assert.equal(t.state.shiftCalls.length, 0, "lesson-plan-service not called");
  const note = t.state.notifyCalls[0];
  assert.equal(note.title, "Holiday added");
  assert.ok(note.to.includes("t1") && note.to.includes("p1"));
  assert.equal(note.to.includes("a1"), false, "the admin who added it is not notified");

  assert.ok((await school()).holidays.some((h) => h.date === date), "other services see it");
});

test("the same date twice → 409", async () => {
  const res = await api("post", "/holidays", "a1").send({ name: "Again", date: dayFromToday(40) });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already a holiday \(Diwali\)/);
});

test("a sudden holiday asks lesson-plan to move lessons and tells the teachers", async () => {
  const date = dayFromToday(10);
  const res = await api("post", "/holidays", "p1").send({ name: "Rain", date, unexpected: true });
  assert.equal(res.status, 201);

  assert.deepEqual(t.state.shiftCalls, [{ schoolId: "one", date }]);
  assert.equal(res.body.data.affectedCount, 3);
  assert.equal(res.body.data.movedCount, 12);

  const titles = t.state.notifyCalls.map((n) => n.title);
  assert.ok(titles.includes(`Sudden holiday on ${date}`));
  const moved = t.state.notifyCalls.find((n) => n.title === "Your lessons were moved");
  assert.deepEqual(moved.to.sort(), ["t1", "t2"]);
});

test("editing a sudden holiday without changing the date does NOT move lessons again", async () => {
  const list = (await api("get", "/holidays", "a1")).body.data;
  const rain = list.find((h) => h.name === "Rain");
  const res = await api("put", `/holidays/${rain.id}`, "a1").send({ name: "Heavy rain", date: rain.date, unexpected: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Heavy rain");
  assert.equal(t.state.shiftCalls.length, 0);
  assert.equal(t.state.notifyCalls[0].title, "Holiday updated");
});

test("a sudden holiday in the past does not move lessons", async () => {
  const res = await api("post", "/holidays", "a1").send({ name: "Old", date: dayFromToday(-20), unexpected: true });
  assert.equal(res.status, 201);
  assert.equal(t.state.shiftCalls.length, 0);
});

test("deleting a holiday notifies everyone", async () => {
  const list = (await api("get", "/holidays", "a1")).body.data;
  const diwali = list.find((h) => h.name === "Diwali");
  const res = await api("delete", `/holidays/${diwali.id}`, "a1");
  assert.equal(res.status, 200);
  assert.equal(t.state.notifyCalls[0].title, "Holiday removed");
  assert.equal((await school()).holidays.some((h) => h.id === diwali.id), false);
});

test("deleting an unknown holiday → 404", async () => {
  const res = await api("delete", "/holidays/hol-nope", "a1");
  assert.equal(res.status, 404);
});

// ---------- Exams ----------

let examId;

test("adding an exam also adds the exam day to the school calendar", async () => {
  const examDate = dayFromToday(50);
  const res = await api("post", "/exams", "a1").send({ examName: "Half-Yearly", examDate, subject: "Mathematics", requiredPeriods: 26 });
  assert.equal(res.status, 201);
  examId = res.body.data.id;
  assert.equal(t.state.notifyCalls[0].title, "Exam planned");
  assert.ok((await school()).exams.some((e) => e.date === examDate && e.title === "Half-Yearly"));
});

test("moving the exam moves its exam day (no duplicate day left behind)", async () => {
  const newDate = dayFromToday(51);
  const res = await api("put", `/exams/${examId}`, "a1").send({ examName: "Half-Yearly", examDate: newDate });
  assert.equal(res.status, 200);
  const days = (await school()).exams.filter((e) => e.title === "Half-Yearly");
  assert.deepEqual(days.map((d) => d.date), [newDate]);
});

test("deleting the exam removes its exam day", async () => {
  const res = await api("delete", `/exams/${examId}`, "a1");
  assert.equal(res.status, 200);
  assert.equal((await school()).exams.some((e) => e.title === "Half-Yearly"), false);
  const list = (await api("get", "/exams", "t1")).body.data;
  assert.equal(list.some((e) => e.id === examId), false);
});

test("a teacher cannot add an exam → 403", async () => {
  const res = await api("post", "/exams", "t1").send({ examName: "x", examDate: dayFromToday(60) });
  assert.equal(res.status, 403);
});

// keep last – stops the fake lesson-plan-service
test("lesson-plan-service down: the sudden holiday is still saved (no lessons moved)", async () => {
  await t.stopLessonPlan();
  const res = await api("post", "/holidays", "a1").send({ name: "Storm", date: dayFromToday(20), unexpected: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.shift, null);
  assert.equal(res.body.data.movedCount, 0);
  assert.ok((await school()).holidays.some((h) => h.title === "Storm"));
});