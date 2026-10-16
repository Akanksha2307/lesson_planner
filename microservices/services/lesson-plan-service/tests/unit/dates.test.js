// Date helpers – everything in the planner depends on these.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, weekdayIndex, startOfWeek, daysBetween } from "../../src/utils/dates.js";

test("weekdayIndex: Monday = 0 … Sunday = 6 (same as the timetable)", () => {
  assert.equal(weekdayIndex("2026-10-19"), 0); // Monday
  assert.equal(weekdayIndex("2026-10-24"), 5); // Saturday
  assert.equal(weekdayIndex("2026-10-25"), 6); // Sunday
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("startOfWeek gives the Monday", () => {
  assert.equal(startOfWeek("2026-10-22"), "2026-10-19");
  assert.equal(startOfWeek("2026-10-25"), "2026-10-19"); // Sunday belongs to the week before
  assert.equal(startOfWeek("2026-10-19"), "2026-10-19");
});

test("daysBetween counts whole days", () => {
  assert.equal(daysBetween("2026-10-19", "2026-10-26"), 7);
});