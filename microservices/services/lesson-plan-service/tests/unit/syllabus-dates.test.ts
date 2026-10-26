// Excel date cells for a chapter's From / To columns
import { test } from "node:test";
import assert from "node:assert/strict";
import { excelDate } from "../../src/services/syllabus.service";

test("ISO, day-first and Excel day numbers all become YYYY-MM-DD", () => {
  assert.equal(excelDate("2026-08-01"), "2026-08-01");
  assert.equal(excelDate("1-8-2026"), "2026-08-01");
  assert.equal(excelDate("01/08/2026"), "2026-08-01");
  assert.equal(excelDate(46235), "2026-08-01");
  assert.equal(excelDate(new Date(Date.UTC(2026, 7, 1))), "2026-08-01");
});

test("empty or not a date → undefined (the engine decides)", () => {
  assert.equal(excelDate(""), undefined);
  assert.equal(excelDate(undefined), undefined);
  assert.equal(excelDate("next month"), undefined);
});