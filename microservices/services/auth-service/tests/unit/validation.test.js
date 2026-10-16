// What the request bodies may contain. No database, no other services.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loginBody } from "../../src/validations/auth.validation.js";
import { settingsBody } from "../../src/validations/masters.validation.js";
import { holidayBody, examBody } from "../../src/validations/calendar.validation.js";

describe("login", () => {
  test("username and password are required", () => {
    assert.equal(loginBody.safeParse({}).success, false);
    assert.equal(loginBody.safeParse({ username: "t1" }).success, false);
    assert.equal(loginBody.safeParse({ username: "  ", password: "x" }).success, false);
  });

  test("the username is trimmed", () => {
    assert.equal(loginBody.parse({ username: "  t1 ", password: "demo123" }).username, "t1");
  });
});

describe("settings", () => {
  test("only the settings sent are changed (all fields optional)", () => {
    assert.deepEqual(settingsBody.parse({ principalAfterDays: 3 }), { principalAfterDays: 3 });
  });

  test("principalAfterDays must be 0–30 whole days", () => {
    assert.equal(settingsBody.safeParse({ principalAfterDays: -1 }).success, false);
    assert.equal(settingsBody.safeParse({ principalAfterDays: 31 }).success, false);
    assert.equal(settingsBody.safeParse({ principalAfterDays: 1.5 }).success, false);
  });

  test("the reminder time must look like 18:00", () => {
    assert.equal(settingsBody.safeParse({ dailyReminderTime: "6pm" }).success, false);
    assert.equal(settingsBody.safeParse({ dailyReminderTime: "18:00" }).success, true);
  });

  test("approver can only be hod or principal", () => {
    assert.equal(settingsBody.safeParse({ approver: "teacher" }).success, false);
  });
});

describe("holiday", () => {
  test('the frontend\'s "name" becomes the title', () => {
    const h = holidayBody.parse({ name: "Diwali", date: "2026-11-09" });
    assert.equal(h.title, "Diwali");
    assert.equal(h.unexpected, false);
    assert.equal(h.description, "");
  });

  test("a name is required", () => {
    const r = holidayBody.safeParse({ date: "2026-11-09" });
    assert.equal(r.success, false);
    assert.equal(r.error.issues[0].message, "Enter a holiday name.");
  });

  test("the date must be YYYY-MM-DD", () => {
    assert.equal(holidayBody.safeParse({ name: "x", date: "09/11/2026" }).success, false);
  });
});

describe("exam", () => {
  test("numbers sent as text are turned into numbers", () => {
    const e = examBody.parse({ examName: "Half-Yearly", examDate: "2026-11-24", requiredPeriods: "26" });
    assert.equal(e.requiredPeriods, 26);
    assert.equal(e.revisionPeriods, 0);
  });

  test("exam name and exam date are required", () => {
    assert.equal(examBody.safeParse({ examDate: "2026-11-24" }).success, false);
    assert.equal(examBody.safeParse({ examName: "x" }).success, false);
  });

  test("start and end date may be empty", () => {
    assert.equal(examBody.parse({ examName: "x", examDate: "2026-11-24", startDate: "" }).startDate, "");
  });
});