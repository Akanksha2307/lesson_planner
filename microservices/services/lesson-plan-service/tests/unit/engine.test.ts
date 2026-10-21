// Plan generation – pure functions, no database, no other services.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generatePlanItems, taughtPeriods, byDateAndPeriod } from "../../src/services/plans.engine";

const periodIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const syllabus = {
  chapters: [
    { id: "ch1", title: "Crops", topics: [{ id: "a", title: "A", estPeriods: 2 }, { id: "b", title: "B", estPeriods: 1 }] },
    { id: "ch2", title: "Microbes", topics: [{ id: "c", title: "C", estPeriods: 1 }] }
  ]
};
// Monday p1 and p3, Wednesday p2  (weekday 0 = Monday)
const slots = [
  { weekday: 0, periodId: "p3" },
  { weekday: 0, periodId: "p1" },
  { weekday: 2, periodId: "p2" }
];
const plan = (extra = {}) =>
  generatePlanItems({
    syllabus,
    slots,
    startDate: "2026-10-19", // Monday
    endDate: "2026-10-25", // Sunday
    blockedDates: new Set(),
    existingItems: [],
    plannedKeys: new Set(),
    periodIds,
    ...extra
  });

describe("generatePlanItems", () => {
  test("puts topics into the timetable periods, in syllabus and period order", () => {
    const { placed, unscheduled } = plan();
    assert.deepEqual(
      placed.map((p) => `${p.date} ${p.periodId} ${p.topic.id}`),
      ["2026-10-19 p1 a", "2026-10-19 p3 a", "2026-10-21 p2 b"]
    );
    assert.deepEqual(unscheduled.map((u) => u.id), ["c"], "topic c did not fit");
  });

  test("a topic with estPeriods 2 gets two periods", () => {
    const { placed } = plan();
    assert.equal(placed.filter((p) => p.topic.id === "a").length, 2);
  });

  test("a holiday or exam day is skipped and reported", () => {
    const { placed, skippedDays } = plan({ blockedDates: new Set(["2026-10-19"]) });
    assert.deepEqual(skippedDays, ["2026-10-19"]);
    assert.equal(placed.some((p) => p.date === "2026-10-19"), false);
  });

  test("Sundays are never used", () => {
    const { placed } = plan({ slots: [...slots, { weekday: 6, periodId: "p1" }] });
    assert.equal(placed.some((p) => p.date === "2026-10-25"), false);
  });

  test("a period that already has a lesson is left alone", () => {
    const { placed } = plan({ plannedKeys: new Set(["2026-10-19|p1"]) });
    assert.equal(placed.some((p) => p.date === "2026-10-19" && p.periodId === "p1"), false);
    assert.equal(placed[0].periodId, "p3");
  });

  test("topics already taught are not planned again", () => {
    const existingItems = [
      { topicId: "a", status: "completed" },
      { topicId: "a", status: "completed" }
    ];
    const { placed } = plan({ existingItems });
    assert.equal(placed.some((p) => p.topic.id === "a"), false);
    assert.equal(placed[0].topic.id, "b");
  });

  test("a partly done topic still needs its remaining period", () => {
    const { placed } = plan({ existingItems: [{ topicId: "a", status: "partial" }] });
    assert.equal(placed.filter((p) => p.topic.id === "a").length, 2, "1.5 left → rounded up to 2");
  });
});

describe("taughtPeriods", () => {
  test("completed = 1, partial = ½, others = 0", () => {
    assert.deepEqual(
      taughtPeriods([
        { topicId: "a", status: "completed" },
        { topicId: "a", status: "partial" },
        { topicId: "b", status: "planned" },
        { topicId: "b", status: "not_done" }
      ]),
      { a: 1.5 }
    );
  });
});

describe("byDateAndPeriod", () => {
  test("sorts by date, then by bell order", () => {
    const items = [
      { date: "2026-10-20", periodId: "p1" },
      { date: "2026-10-19", periodId: "p5" },
      { date: "2026-10-19", periodId: "p2" }
    ];
    items.sort(byDateAndPeriod(periodIds));
    assert.deepEqual(items.map((i) => `${i.date} ${i.periodId}`), ["2026-10-19 p2", "2026-10-19 p5", "2026-10-20 p1"]);
  });
});