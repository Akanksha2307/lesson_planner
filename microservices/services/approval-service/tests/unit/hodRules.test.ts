import '../helpers/env.js';
// The approval rule: who may review a lesson plan. No database, no other services.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hodStatus, whyCannotReview } from "../../src/services/hodRules.js";
import { demoSchool, demoPlan, daysAgo } from "../helpers/school.js";

import type { AuthUser } from "../../src/types/auth.types.js";

type Who = Pick<AuthUser, "id" | "role">;
const hod: Who = { id: "t3", role: "hod" };
const otherHod: Who = { id: "t9", role: "hod" };
const principal: Who = { id: "p1", role: "principal" };
const teacher: Who = { id: "t1", role: "teacher" };
// whyCannotReview returns null (may review) or the reason as text
const reasonOf = (r: string | null): string => r ?? "";

describe("HOD", () => {
  test("the HOD of the subject's department can review", () => {
    assert.equal(whyCannotReview(demoSchool(), hod, demoPlan()), null);
  });

  test("an HOD of another department cannot review", () => {
    assert.match(reasonOf(whyCannotReview(demoSchool(), otherHod, demoPlan())), /Only the HOD of this subject/);
  });
});

describe("Principal", () => {
  test("cannot review a fresh plan while the HOD is available", () => {
    const reason = reasonOf(whyCannotReview(demoSchool(), principal, demoPlan()));
    assert.match(reason, /Anitha Rao \(HOD\) reviews this plan/);
    assert.match(reason, /in 2 days/);
  });

  test("still waits after 1 day (says 1 day left)", () => {
    const reason = reasonOf(whyCannotReview(demoSchool(), principal, demoPlan({ submittedAt: daysAgo(1) })));
    assert.match(reason, /in 1 day\./);
  });

  test("can review once the plan has waited 2 days", () => {
    assert.equal(whyCannotReview(demoSchool(), principal, demoPlan({ submittedAt: daysAgo(2) })), null);
  });

  test("can review when the HOD is inactive", () => {
    const school = demoSchool();
    school.staff.find((s) => s.id === "t3")!.active = false;
    assert.equal(whyCannotReview(school, principal, demoPlan()), null);
  });

  test("can review when the department has no HOD", () => {
    assert.equal(whyCannotReview(demoSchool(), principal, demoPlan({ subjectId: "art" })), null);
  });

  test("principalAfterDays = 0 lets the principal review straight away", () => {
    const school = demoSchool({ settings: { principalAfterDays: 0 } });
    assert.equal(whyCannotReview(school, principal, demoPlan()), null);
  });
});

describe("Others", () => {
  test("a teacher can never review", () => {
    assert.match(reasonOf(whyCannotReview(demoSchool(), teacher, demoPlan())), /Only an HOD or the principal/);
  });

  test('approver = "principal": only the principal reviews', () => {
    const school = demoSchool({ settings: { approver: "principal" } });
    assert.equal(whyCannotReview(school, principal, demoPlan()), null);
    assert.match(reasonOf(whyCannotReview(school, hod, demoPlan())), /only the principal reviews/);
  });
});

describe("hodStatus", () => {
  test("names the HOD and counts waiting days", () => {
    const s = hodStatus(demoSchool(), demoPlan({ submittedAt: daysAgo(3) }));
    assert.equal(s.hodId, "t3");
    assert.equal(s.hodName, "Anitha Rao");
    assert.equal(s.waitingDays, 3);
    assert.equal(s.available, false);
    assert.match(reasonOf(s.reason), /waited 3 days/);
  });

  test("gives the reason when there is no HOD", () => {
    const s = hodStatus(demoSchool(), demoPlan({ subjectId: "art" }));
    assert.equal(s.hodId, null);
    assert.match(reasonOf(s.reason), /no HOD is assigned/);
  });
});