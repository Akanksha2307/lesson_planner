// The Reports page – real app + test database, fake auth-service.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor } from "../helpers/setup.js";

let t;
const T1 = tokenFor("t1", "teacher");
const T3 = tokenFor("t3", "hod");

const iso = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

before(async () => {
  t = await startTestApp();
  const { Plan, PlanItem } = await import("../../src/models/plans.model.js");
  // t1, Class 8-B Science: 2 periods done + 1 partly done of "Crop Production" (5 periods),
  // 1 planned in the past (not marked), 1 rescheduled (does not count)
  const plan = await Plan.create({
    schoolId: "one", teacherId: "t1", classId: "c8", sectionId: "s8b", subjectId: "sci",
    startDate: iso(-10), endDate: iso(10), status: "approved",
    reviews: [{ by: "t3", action: "approved" }, { by: "t3", action: "returned" }]
  });
  const item = (n, topicId, status) => ({
    schoolId: "one", planId: plan._id, teacherId: "t1", classId: "c8", sectionId: "s8b", subjectId: "sci",
    topicId, topicTitle: topicId, date: iso(n), periodId: "p1", status
  });
  await PlanItem.create([
    item(-5, "tp-0-0-0", "completed"),
    item(-4, "tp-0-0-1", "completed"),
    item(-3, "tp-0-0-2", "partial"),
    item(-2, "tp-0-0-3", "planned"),
    item(-1, "tp-0-0-3", "rescheduled")
  ]);
});
after(async () => {
  await t.stop();
});

// ---------- Reports ----------

test("coverage: one row per class + subject in the timetable, with names", async () => {
  const res = await request(t.app).get("/api/lesson-planner/reports/coverage").set("Authorization", T3);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  const row = res.body.data.find((r) => r.sectionId === "s8b" && r.subjectId === "sci");
  assert.equal(row.classLabel, "Class 8-B");
  assert.equal(row.subjectName, "Science");
  assert.equal(row.teacherName, "Priya Sharma");
  assert.equal(row.hasSyllabus, true);
});

test("coverage maths: completed = 1, partial = ½, rescheduled = 0", async () => {
  const res = await request(t.app).get("/api/lesson-planner/reports/coverage?sectionId=s8b&subjectId=sci").set("Authorization", T3);
  assert.equal(res.body.data.length, 1);
  const ch1 = res.body.data[0].chapters[0];
  assert.equal(ch1.title, "Crop Production and Management");
  // chapter 1 has 4 topics; taught 1 + 1 + 0.5 periods out of its estimated periods
  const syl = (await import("../helpers/setup.js")).demoSyllabus();
  const total = syl.chapters[0].topics.reduce((s, tp) => s + tp.estPeriods, 0);
  assert.equal(ch1.percent, Math.round((2.5 / total) * 100));
  assert.ok(res.body.data[0].overall > 0);
});

test("coverage: a class without a syllabus says so", async () => {
  const res = await request(t.app).get("/api/lesson-planner/reports/coverage").set("Authorization", T3);
  const english = res.body.data.find((r) => r.subjectName === "English");
  assert.equal(english.hasSyllabus, false);
  assert.equal(english.overall, 0);
});

test("coverage: a teacher only sees her own classes", async () => {
  const res = await request(t.app).get("/api/lesson-planner/reports/coverage").set("Authorization", T1);
  assert.ok(res.body.data.length > 0);
  assert.ok(res.body.data.every((r) => r.teacherName === "Priya Sharma"));
});

test("teacher report: counts and rates for Priya", async () => {
  const res = await request(t.app).get("/api/lesson-planner/reports/teachers").set("Authorization", T3);
  assert.equal(res.status, 200);
  const priya = res.body.data.find((r) => r.id === "t1");
  assert.equal(priya.name, "Priya Sharma");
  assert.equal(priya.department, "Science");
  assert.equal(priya.planned, 4, "rescheduled lesson not counted");
  assert.equal(priya.completed, 2);
  assert.equal(priya.partial, 1);
  assert.equal(priya.completionRate, 50);
  assert.equal(priya.approvalRate, 50, "1 approved of 2 reviews");
  assert.equal(priya.pendingMarking, 1, "1 planned lesson in the past not marked");
  assert.match(priya.nextWeek, /^\d+\/\d+$/);
});

test("teacher report: a teacher only sees her own row", async () => {
  const res = await request(t.app).get("/api/lesson-planner/reports/teachers").set("Authorization", T1);
  assert.deepEqual(res.body.data.map((r) => r.id), ["t1"]);
});