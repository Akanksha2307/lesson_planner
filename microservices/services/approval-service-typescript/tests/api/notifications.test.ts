// @ts-nocheck
// The bell: GET /notifications, POST /notifications/read, and POST /internal/notify
// (which other services use). Test database, no other services needed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, tokenFor, INTERNAL_TOKEN } from "../helpers/setup.js";

let t;
const T1 = tokenFor("t1", "teacher");
const T3 = tokenFor("t3", "hod");
const notify = (body, token = INTERNAL_TOKEN) =>
  request(t.app).post("/internal/notify").set("x-internal-token", token).send(body);

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.stop();
});

test("/internal/notify without the internal token → 401", async () => {
  const res = await request(t.app).post("/internal/notify").send({ schoolId: "one", to: ["t1"], title: "x", text: "y" });
  assert.equal(res.status, 401);
});

test("/internal/notify with a wrong token → 401", async () => {
  const res = await notify({ schoolId: "one", to: ["t1"], title: "x", text: "y" }, "wrong");
  assert.equal(res.status, 401);
});

test("/internal/notify with missing fields → 400", async () => {
  const res = await notify({ schoolId: "one" });
  assert.equal(res.status, 400);
});

test("/internal/notify creates one notification per person (duplicates removed)", async () => {
  const res = await notify({ schoolId: "one", to: ["t1", "t3", "t1"], title: "Holiday added", text: "Diwali on 2026-11-09.", link: "/lesson-planner/calendar" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.created, 2);
});

test("GET /notifications gives the shape the bell uses, only for me", async () => {
  const res = await request(t.app).get("/api/lesson-planner/notifications").set("Authorization", T1);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  const n = res.body.data[0];
  assert.deepEqual(Object.keys(n).sort(), ["at", "id", "link", "read", "text", "title", "to"]);
  assert.equal(n.to, "t1");
  assert.equal(n.title, "Holiday added");
  assert.equal(n.read, false);
});

test("?unread=true shows only unread ones", async () => {
  const res = await request(t.app).get("/api/lesson-planner/notifications?unread=true").set("Authorization", T1);
  assert.equal(res.body.data.length, 1);
});

test("mark all as read (no ids, like the frontend sends)", async () => {
  const res = await request(t.app).post("/api/lesson-planner/notifications/read").set("Authorization", T1).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.data.modifiedCount, 1);

  const unread = await request(t.app).get("/api/lesson-planner/notifications?unread=true").set("Authorization", T1);
  assert.equal(unread.body.data.length, 0);
});

test("marking read only touches my own notifications", async () => {
  const res = await request(t.app).get("/api/lesson-planner/notifications?unread=true").set("Authorization", T3);
  assert.equal(res.body.data.length, 1, "t3's notification is still unread");
});

test("marking with invalid ids → 400", async () => {
  const res = await request(t.app).post("/api/lesson-planner/notifications/read").set("Authorization", T1).send({ notificationIds: ["not-an-id"] });
  assert.equal(res.status, 400);
});

test("no login token → 401", async () => {
  const res = await request(t.app).get("/api/lesson-planner/notifications");
  assert.equal(res.status, 401);
});

test("GET /health → 200", async () => {
  const res = await request(t.app).get("/health");
  assert.equal(res.status, 200);
});

test("an unknown route → 404", async () => {
  const res = await request(t.app).get("/api/lesson-planner/nothing-here").set("Authorization", T1);
  assert.equal(res.status, 404);
});