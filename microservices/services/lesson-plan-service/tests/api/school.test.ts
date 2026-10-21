// School data now lives in lesson-plan-service: masters, settings, templates, holidays,
// exams and the /internal school routes. REAL app + test database + the demo school.
// approval-service is a FAKE that records the bell notifications; moving the lessons of a
// sudden holiday is stubbed here (the real move is tested in holidays.test.ts).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor, mondayIn, INTERNAL_TOKEN } from "../helpers/setup";

let t: any;
const token: Record<string, string> = {
  t1: tokenFor("t1", "teacher"),
  a1: tokenFor("a1", "admin"),
  p1: tokenFor("p1", "principal")
};
const api = (method: string, path: string, who: string) =>
  (request(t.app) as any)[method](`/api/lesson-planner${path}`).set("Authorization", token[who]);
const school = async () =>
  (await request(t.app).get("/internal/school/one").set("x-internal-token", INTERNAL_TOKEN)).body.data;

// "YYYY-MM-DD" n days from today (India time, like the service)
const dayFromToday = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

before(async () => {
  t = await startTestApp({ realSchool: true });
});
after(async () => {
  await t.stop();
});
beforeEach(() => {
  t.state.shiftCalls.length = 0;
  t.state.notifyCalls.length = 0;
  t.state.shiftFails = false;
});

// ---------- masters / settings / templates ----------

test("GET /masters gives the school data the frontend loads at start-up", async () => {
  const res = await api("get", "/masters", "t1");
  assert.equal(res.status, 200);
  const d = res.body.data;
  for (const key of ["classes", "sections", "subjects", "departments", "staff", "timetable", "holidays", "exams", "templates", "settings", "periods"]) {
    assert.ok(key in d, `has ${key}`);
  }
  assert.ok(d.classes.length > 0 && d.timetable.length > 0 && d.staff.length > 0);
  assert.ok(d.periods.every((p: any) => p.type === "period"));
});

test("GET /masters staff list has no passwords or usernames", async () => {
  const res = await api("get", "/masters", "t1");
  assert.deepEqual(Object.keys(res.body.data.staff[0]).sort(), ["departmentId", "id", "name", "role"]);
});

test("GET /masters without a token → 401", async () => {
  const res = await request(t.app).get("/api/lesson-planner/masters");
  assert.equal(res.status, 401);
});

test("a teacher cannot change settings → 403", async () => {
  const res = await api("put", "/settings", "t1").send({ principalAfterDays: 5 });
  assert.equal(res.status, 403);
});

test("the admin changes principalAfterDays, and planning / approval see it", async () => {
  const res = await api("put", "/settings", "a1").send({ principalAfterDays: 3 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.principalAfterDays, 3);
  assert.equal((await school()).settings.principalAfterDays, 3);
});

test("an invalid setting → 400 with the field name in the message", async () => {
  const res = await api("put", "/settings", "p1").send({ dailyReminderTime: "6pm" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /dailyReminderTime/);
});

test("templates: duplicate field keys → 400, unknown template → 404, a teacher → 403", async () => {
  const [first] = (await api("get", "/masters", "a1")).body.data.templates;
  const dup = { name: "X", fields: [{ key: "a", label: "A", type: "text" }, { key: "a", label: "B", type: "text" }] };
  const bad = await api("put", `/templates/${first.id}`, "a1").send(dup);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.message, "Two fields have the same key.");

  const missing = await api("put", "/templates/tpl-nope", "a1").send({ name: "X", fields: [] });
  assert.equal(missing.status, 404);

  const denied = await api("put", `/templates/${first.id}`, "t1").send({ name: "X", fields: [] });
  assert.equal(denied.status, 403);
});

test("making a template the default turns the others off", async () => {
  const templates = (await api("get", "/masters", "a1")).body.data.templates;
  const target = templates[templates.length - 1];
  const res = await api("put", `/templates/${target.id}`, "a1").send({ name: target.name, isDefault: true, fields: target.fields });
  assert.equal(res.status, 200);
  const after = (await school()).templates;
  assert.deepEqual(after.filter((x: any) => x.isDefault).map((x: any) => x.id), [target.id]);
});

// ---------- holidays ----------

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

  assert.equal(t.state.shiftCalls.length, 0, "no lessons moved");
  const note = t.state.notifyCalls[0];
  assert.equal(note.title, "Holiday added");
  assert.ok(note.to.includes("t1") && note.to.includes("p1"));
  assert.equal(note.to.includes("a1"), false, "the admin who added it is not notified");

  assert.ok((await school()).holidays.some((h: any) => h.date === date), "planning sees it");
});

test("the same date twice → 409", async () => {
  const res = await api("post", "/holidays", "a1").send({ name: "Again", date: dayFromToday(40) });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already a holiday \(Diwali\)/);
});

test("a sudden holiday moves the lessons directly and tells the teachers", async () => {
  const date = dayFromToday(10);
  const res = await api("post", "/holidays", "p1").send({ name: "Rain", date, unexpected: true });
  assert.equal(res.status, 201);

  assert.deepEqual(t.state.shiftCalls, [{ schoolId: "one", date }]);
  assert.equal(res.body.data.affectedCount, 3);
  assert.equal(res.body.data.movedCount, 12);

  const titles = t.state.notifyCalls.map((n: any) => n.title);
  assert.ok(titles.includes(`Sudden holiday on ${date}`));
  const moved = t.state.notifyCalls.find((n: any) => n.title === "Your lessons were moved");
  assert.deepEqual(moved.to.sort(), ["t1", "t2"]);
});

test("editing a sudden holiday without changing the date does NOT move lessons again", async () => {
  const rain = (await api("get", "/holidays", "a1")).body.data.find((h: any) => h.name === "Rain");
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

test("if moving the lessons fails, the sudden holiday is still saved", async () => {
  t.state.shiftFails = true;
  const res = await api("post", "/holidays", "a1").send({ name: "Storm", date: dayFromToday(20), unexpected: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.shift, null);
  assert.equal(res.body.data.movedCount, 0);
  assert.ok((await school()).holidays.some((h: any) => h.title === "Storm"));
});

test("deleting a holiday notifies everyone", async () => {
  const diwali = (await api("get", "/holidays", "a1")).body.data.find((h: any) => h.name === "Diwali");
  const res = await api("delete", `/holidays/${diwali.id}`, "a1");
  assert.equal(res.status, 200);
  assert.equal(t.state.notifyCalls[0].title, "Holiday removed");
  assert.equal((await school()).holidays.some((h: any) => h.id === diwali.id), false);
});

test("deleting an unknown holiday → 404", async () => {
  const res = await api("delete", "/holidays/hol-nope", "a1");
  assert.equal(res.status, 404);
});

// ---------- exams ----------

let examId: string;

test("adding an exam also adds the exam day to the school calendar", async () => {
  const examDate = dayFromToday(50);
  const res = await api("post", "/exams", "a1").send({ examName: "Half-Yearly", examDate, subject: "Mathematics", requiredPeriods: 26 });
  assert.equal(res.status, 201);
  examId = res.body.data.id;
  assert.equal(t.state.notifyCalls[0].title, "Exam planned");
  assert.ok((await school()).exams.some((e: any) => e.date === examDate && e.title === "Half-Yearly"));
});

test("moving the exam moves its exam day (no duplicate day left behind)", async () => {
  const newDate = dayFromToday(51);
  const res = await api("put", `/exams/${examId}`, "a1").send({ examName: "Half-Yearly", examDate: newDate });
  assert.equal(res.status, 200);
  const days = (await school()).exams.filter((e: any) => e.title === "Half-Yearly");
  assert.deepEqual(days.map((d: any) => d.date), [newDate]);
});

test("deleting the exam removes its exam day", async () => {
  const res = await api("delete", `/exams/${examId}`, "a1");
  assert.equal(res.status, 200);
  assert.equal((await school()).exams.some((e: any) => e.title === "Half-Yearly"), false);
  const list = (await api("get", "/exams", "t1")).body.data;
  assert.equal(list.some((e: any) => e.id === examId), false);
});

test("a teacher cannot add an exam → 403", async () => {
  const res = await api("post", "/exams", "t1").send({ examName: "x", examDate: dayFromToday(60) });
  assert.equal(res.status, 403);
});

// ---------- planning reads the school from the database (end to end) ----------

test("a holiday added through the API is skipped when a plan is generated", async () => {
  const start = mondayIn(90);
  const wednesday = addDays(start, 2);
  const hol = await api("post", "/holidays", "a1").send({ name: "Local holiday", date: wednesday });
  assert.equal(hol.status, 201);

  const res = await api("post", "/plans/generate", "t1").send({
    classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: start, endDate: addDays(start, 5)
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.placedCount, 5);
  assert.deepEqual(res.body.data.skippedDays, [wednesday]);
});

// ---------- internal routes ----------

test("GET /internal/school/:id needs the internal token", async () => {
  assert.equal((await request(t.app).get("/internal/school/one")).status, 401);
  assert.equal((await request(t.app).get("/internal/school/one").set("x-internal-token", "wrong-token-value")).status, 403);
  const ok = await request(t.app).get("/internal/school/one").set("x-internal-token", INTERNAL_TOKEN);
  assert.equal(ok.status, 200);
  for (const key of ["schoolId", "classes", "sections", "subjects", "departments", "staff", "timetable", "holidays", "exams", "templates", "settings"]) {
    assert.ok(key in ok.body.data, `has ${key}`);
  }
  assert.ok(ok.body.data.departments.every((d: any) => "hodId" in d));
});

test("POST /internal/seed reloads the demo school (keep last)", async () => {
  const res = await request(t.app).post("/internal/seed").set("x-internal-token", INTERNAL_TOKEN).send({ schoolId: "one" });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.staff > 0 && res.body.data.timetable > 0);
  assert.equal((await school()).holidays.some((h: any) => h.title === "Local holiday"), false, "reset to the demo data");
});
