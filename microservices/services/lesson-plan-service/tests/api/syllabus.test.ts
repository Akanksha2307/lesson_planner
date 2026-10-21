// Syllabus: read it, add a chapter, add a topic while planning, import from Excel rows.
// Real app + test database (the Class 8 Science syllabus is loaded by setup.js).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor } from "../helpers/setup";

let t: any;
const T1 = tokenFor("t1", "teacher");
const T3 = tokenFor("t3", "hod");
const A1 = tokenFor("a1", "admin");
const URL = "/api/lesson-planner/syllabus";
const getSyl = async (classId = "c8", subjectId = "sci") =>
  (await request(t.app).get(`${URL}?classId=${classId}&subjectId=${subjectId}`).set("Authorization", T1)).body.data;
const save = (who: any, body: any) => request(t.app).put(URL).set("Authorization", who).send(body);

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.stop();
});

// ---------- read ----------

test("anyone logged in can read the syllabus (chapters with topics and ids)", async () => {
  const syl = await getSyl();
  assert.equal(syl.classId, "c8");
  assert.ok(syl.chapters.length >= 6);
  assert.equal(syl.chapters[0].title, "Crop Production and Management");
  assert.ok(syl.chapters[0].id && syl.chapters[0].topics[0].id);
});

test("a class with no syllabus yet → data is null", async () => {
  assert.equal(await getSyl("c7", "eng"), null);
});

test("classId and subjectId are required → 400", async () => {
  const res = await request(t.app).get(URL).set("Authorization", T1);
  assert.equal(res.status, 400);
});

// ---------- add a chapter (Syllabus page → Save) ----------

test("a teacher cannot edit the whole syllabus → 403", async () => {
  const syl = await getSyl();
  const res = await save(T1, { classId: "c8", subjectId: "sci", version: syl.version, chapters: syl.chapters });
  assert.equal(res.status, 403);
});

test("the HOD adds a new chapter with two topics", async () => {
  const syl = await getSyl();
  const res = await save(T3, {
    classId: "c8",
    subjectId: "sci",
    version: syl.version,
    chapters: [
      ...syl.chapters,
      {
        title: "Stars and the Solar System",
        term: "Term 2",
        topics: [
          { title: "The Moon", estPeriods: 2, subtopics: ["Phases of the moon"] },
          { title: "Constellations", estPeriods: 1 }
        ]
      }
    ]
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, "Syllabus saved");

  const after = await getSyl();
  assert.equal(after.chapters.length, syl.chapters.length + 1);
  assert.equal(after.version, syl.version + 1, "version goes up on every save");
  const ch = after.chapters.at(-1);
  assert.equal(ch.title, "Stars and the Solar System");
  assert.equal(ch.term, "Term 2");
  assert.ok(ch.id, "the new chapter gets an id");
  assert.deepEqual(ch.topics.map((tp: any) => [tp.title, tp.estPeriods]), [["The Moon", 2], ["Constellations", 1]]);
  assert.deepEqual(ch.topics[1].subtopics, ["Constellations"], "no subtopics → the topic name is used");
  assert.equal(after.chapters[0].id, syl.chapters[0].id, "existing chapters keep their ids");
});

test("saving an old copy (someone else saved in between) → 409", async () => {
  const syl = await getSyl();
  const res = await save(A1, { classId: "c8", subjectId: "sci", version: syl.version - 1, chapters: syl.chapters });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /changed by someone else/);
});

test("a chapter without a name → 400", async () => {
  const syl = await getSyl();
  const res = await save(A1, { classId: "c8", subjectId: "sci", version: syl.version, chapters: [...syl.chapters, { title: " ", topics: [] }] });
  assert.equal(res.status, 400);
});

test("a topic with 0 periods → 400", async () => {
  const syl = await getSyl();
  const res = await save(A1, {
    classId: "c8", subjectId: "sci", version: syl.version,
    chapters: [...syl.chapters, { title: "X", topics: [{ title: "Y", estPeriods: 0 }] }]
  });
  assert.equal(res.status, 400);
});

test("a topic already used in a lesson plan cannot be removed → 409", async () => {
  const { PlanItem } = require("../../src/models/plans.model");
  const syl = await getSyl();
  const used = syl.chapters[0].topics[0];
  await PlanItem.create({
    schoolId: "one", planId: "plan-x", teacherId: "t1", classId: "c8", sectionId: "s8a", subjectId: "sci",
    topicId: used.id, topicTitle: used.title, date: "2027-01-04", periodId: "p1", status: "planned"
  });
  const chapters = syl.chapters.map((c: any, i: any) => (i === 0 ? { ...c, topics: c.topics.slice(1) } : c));
  const res = await save(T3, { classId: "c8", subjectId: "sci", version: syl.version, chapters });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already used in lesson plans/);
});

test("the first save for a new class + subject creates the syllabus", async () => {
  const res = await save(A1, { classId: "c7", subjectId: "eng", chapters: [{ title: "Poems", topics: [{ title: "The Daffodils" }] }] });
  assert.equal(res.status, 200);
  const syl = await getSyl("c7", "eng");
  assert.equal(syl.chapters[0].topics[0].title, "The Daffodils");
});

// ---------- add a topic while planning ----------

test("a teacher adds a topic to an existing chapter (marked as added by a teacher)", async () => {
  const syl = await getSyl();
  const ch = syl.chapters[1];
  const res = await request(t.app)
    .post(`${URL}/${syl.id}/topics`)
    .set("Authorization", T1)
    .send({ chapterId: ch.id, title: "Yoghurt making", estPeriods: 1, afterTopicId: ch.topics[0].id });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.topic.source, "teacher");
  assert.equal(res.body.data.topic.addedBy, "t1");

  const after = await getSyl();
  assert.equal(after.chapters[1].topics[1].title, "Yoghurt making", "placed right after the chosen topic");
});

test("the same topic name twice in a chapter → 409", async () => {
  const syl = await getSyl();
  const res = await request(t.app)
    .post(`${URL}/${syl.id}/topics`)
    .set("Authorization", T1)
    .send({ chapterId: syl.chapters[1].id, title: "yoghurt making" });
  assert.equal(res.status, 409);
});

test("a topic with a NEW chapter name creates that chapter", async () => {
  const syl = await getSyl();
  const res = await request(t.app)
    .post(`${URL}/${syl.id}/topics`)
    .set("Authorization", T3)
    .send({ chapterTitle: "Pollution of Air and Water", term: "Term 2", title: "Air pollution" });
  assert.equal(res.status, 201);
  const after = await getSyl();
  const ch = after.chapters.find((c: any) => c.title === "Pollution of Air and Water");
  assert.ok(ch, "chapter created");
  assert.equal(ch.topics[0].title, "Air pollution");
  assert.equal(ch.topics[0].source, "syllabus", "added by an HOD counts as syllabus");
});

test("no chapter chosen and no chapter name → 400", async () => {
  const syl = await getSyl();
  const res = await request(t.app).post(`${URL}/${syl.id}/topics`).set("Authorization", T1).send({ title: "Lost topic" });
  assert.equal(res.status, 400);
});

test("a chapter id that is not in this syllabus → 400", async () => {
  const syl = await getSyl();
  const res = await request(t.app).post(`${URL}/${syl.id}/topics`).set("Authorization", T1).send({ chapterId: "ch-nope", title: "X" });
  assert.equal(res.status, 400);
});

test("both added topics are now part of the syllabus", async () => {
  const syl = await getSyl();
  const allTopics = syl.chapters.flatMap((c: any) => c.topics.map((tp: any) => tp.title));
  assert.ok(allTopics.includes("Yoghurt making") && allTopics.includes("Air pollution"));
});

// ---------- import from an Excel sheet ----------

test("import: rows become chapters and topics; rows without a topic are skipped", async () => {
  const res = await request(t.app)
    .post(`${URL}/import`)
    .set("Authorization", A1)
    .send({
      classId: "c8",
      subjectId: "math",
      rows: [
        { Chapter: "Rational Numbers", Topic: "Properties", Periods: 2, Subtopics: "Closure; Commutativity" },
        { Chapter: "Rational Numbers", Topic: "Number line", Periods: 1 },
        { Chapter: "Squares", Topic: "" }
      ]
    });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.skippedRows, [4], "sheet row 4 (header is row 1) had no topic");
  const syl = await getSyl("c8", "math");
  assert.equal(syl.chapters.length, 1);
  assert.deepEqual(syl.chapters[0].topics[0].subtopics, ["Closure", "Commutativity"]);
  assert.equal(syl.chapters[0].topics[0].estPeriods, 2);
});

test("import: an empty sheet → 400", async () => {
  const res = await request(t.app).post(`${URL}/import`).set("Authorization", A1).send({ classId: "c8", subjectId: "math", rows: [] });
  assert.equal(res.status, 400);
});

test("import: a teacher cannot import → 403", async () => {
  const res = await request(t.app).post(`${URL}/import`).set("Authorization", T1).send({ classId: "c8", subjectId: "math", rows: [{ Chapter: "A", Topic: "B" }] });
  assert.equal(res.status, 403);
});