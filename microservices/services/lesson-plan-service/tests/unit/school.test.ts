// School data without a database: the demo data fits the models, and the holiday flow
// (move lessons → save → notify) does what it should. Models and other services are stubbed.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.INTERNAL_TOKEN = "test-internal-token";

const models = require("../../src/models/index");
const holidayShift = require("../../src/services/holiday-shift.service");
const calendar = require("../../src/services/school-calendar.service");

const demo = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "data", "demo.json"), "utf8"));
const withId = ({ id, ...rest }: any) => (id ? { _id: id, ...rest } : rest);
const dayFromToday = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// ---------- the demo data fits the models ----------

test("every row of data/demo.json is valid for its model", () => {
  const sets: Array<[any, any[]]> = [
    [models.Department, demo.departments.map(withId)],
    [models.SchoolClass, demo.classes.map(withId)],
    [models.Section, demo.sections.map(withId)],
    [models.Subject, demo.subjects.map(withId)],
    [models.Staff, demo.staff.map(withId)],
    [models.TimetableSlot, demo.timetable],
    [models.Holiday, demo.holidays],
    [models.Exam, demo.exams],
    [models.Template, demo.templates.map(withId)]
  ];
  for (const [Model, rows] of sets) {
    assert.ok(rows.length > 0, `${Model.modelName} has rows`);
    rows.forEach((row: any, i: number) => {
      const error = new Model({ order: i + 1, ...row, schoolId: "one" }).validateSync();
      assert.equal(error, undefined, `${Model.modelName} row ${i}: ${error?.message}`);
    });
  }
  const settings = new models.Settings({ _id: "one", ...demo.settings, bellSchedule: demo.bellSchedule });
  assert.equal(settings.validateSync(), undefined);
});

test("staff have no password fields; documents are sent to the client with id, not _id", () => {
  const staff = new models.Staff({ schoolId: "one", name: "A", role: "teacher" }).toJSON();
  assert.ok(staff.id.startsWith("stf-"));
  assert.equal("_id" in staff, false);
  assert.equal("passwordHash" in staff || "username" in staff, false);
  assert.ok(new models.Staff({ schoolId: "one", name: "A", role: "janitor" }).validateSync(), "bad role rejected");
});

// ---------- holiday flow ----------

function stubDatabase(options: { shift?: any; shiftThrows?: boolean } = {}) {
  const saved: any[] = [];
  const notes: any[] = [];
  const shiftCalls: any[] = [];
  mock.method(models.Holiday, "findOne", async () => null);
  mock.method(models.Staff, "find", () => ({ lean: async () => [{ _id: "t1" }, { _id: "t2" }, { _id: "a1" }] }));
  mock.method(models.Holiday.prototype, "save", async function (this: any) {
    saved.push(this);
    return this;
  });
  mock.method(holidayShift, "shiftLessonsForHoliday", async (schoolId: string, date: string) => {
    shiftCalls.push({ schoolId, date });
    if (options.shiftThrows) throw new Error("boom");
    return options.shift ?? { affectedCount: 3, movedCount: 12, teacherIds: ["t1", "a1"], planIds: [] };
  });
  mock.method(globalThis, "fetch", async (_url: string, init: any) => {
    notes.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ data: { created: 1 } }) };
  });
  return { saved, notes, shiftCalls };
}

const ctx = { schoolId: "one", academicYearId: "", boardId: "" };
const admin = { id: "a1", role: "admin" };

test("a sudden holiday: lessons are moved directly, counts saved, teachers told", async () => {
  const s = stubDatabase();
  const date = dayFromToday(5);
  const result = await calendar.saveHoliday(ctx, admin, undefined, { title: "Rain", date, description: "", unexpected: true });

  assert.deepEqual(s.shiftCalls, [{ schoolId: "one", date }]);
  assert.equal(result.affectedCount, 3);
  assert.equal(result.movedCount, 12);
  assert.equal(result.name, "Rain");
  assert.equal(result.notified, true);
  assert.equal(s.saved.length, 1);

  assert.equal(s.notes[0].title, `Sudden holiday on ${date}`);
  assert.deepEqual(s.notes[0].to, ["t1", "t2"], "everyone except the admin who made it");
  assert.equal(s.notes[1].title, "Your lessons were moved");
  assert.deepEqual(s.notes[1].to, ["t1"], "affected teachers except the admin");
  mock.restoreAll();
});

test("a normal holiday does not move lessons", async () => {
  const s = stubDatabase();
  const result = await calendar.saveHoliday(ctx, admin, undefined, { title: "Diwali", date: dayFromToday(30), description: "", unexpected: false });
  assert.equal(s.shiftCalls.length, 0);
  assert.equal(result.shift, null);
  assert.equal(s.notes[0].title, "Holiday added");
  mock.restoreAll();
});

test("a sudden holiday in the past does not move lessons", async () => {
  const s = stubDatabase();
  await calendar.saveHoliday(ctx, admin, undefined, { title: "Old", date: dayFromToday(-3), description: "", unexpected: true });
  assert.equal(s.shiftCalls.length, 0);
  mock.restoreAll();
});

test("if moving the lessons throws, the holiday is still saved", async () => {
  const s = stubDatabase({ shiftThrows: true });
  const result = await calendar.saveHoliday(ctx, admin, undefined, { title: "Storm", date: dayFromToday(7), description: "", unexpected: true });
  assert.equal(s.saved.length, 1);
  assert.equal(result.shift, null);
  assert.equal(result.movedCount, 0);
  mock.restoreAll();
});

test("approval-service down: the holiday is saved, notified is false", async () => {
  const s = stubDatabase();
  mock.method(globalThis, "fetch", async () => {
    throw new Error("connect ECONNREFUSED");
  });
  const result = await calendar.saveHoliday(ctx, admin, undefined, { title: "Fete", date: dayFromToday(9), description: "", unexpected: false });
  assert.equal(s.saved.length, 1);
  assert.equal(result.notified, false);
  mock.restoreAll();
});
