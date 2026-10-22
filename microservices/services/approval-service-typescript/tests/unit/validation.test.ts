// @ts-nocheck
// What the review request body may contain. No database, no other services.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planReviewSchema } from "../../src/validations/approval.validation.js";

test('"approve" is turned into "approved"', () => {
  assert.equal(planReviewSchema.parse({ action: "approve" }).action, "approved");
});

test('"send-back" is turned into "returned"', () => {
  assert.equal(planReviewSchema.parse({ action: "send-back" }).action, "returned");
});

test("the frontend's own words are accepted as they are", () => {
  assert.equal(planReviewSchema.parse({ action: "approved" }).action, "approved");
  assert.equal(planReviewSchema.parse({ action: "returned" }).action, "returned");
});

test("an unknown action is refused", () => {
  assert.equal(planReviewSchema.safeParse({ action: "delete" }).success, false);
  assert.equal(planReviewSchema.safeParse({}).success, false);
});

test("the comment is trimmed and defaults to empty", () => {
  assert.equal(planReviewSchema.parse({ action: "approved" }).comment, "");
  assert.equal(planReviewSchema.parse({ action: "approved", comment: "  ok  " }).comment, "ok");
});

test("a comment longer than 2000 characters is refused", () => {
  assert.equal(planReviewSchema.safeParse({ action: "returned", comment: "x".repeat(2001) }).success, false);
});