// Login tokens. No database, no other services.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "unit-test-secret";
const { signToken, verifyToken } = await import("../../src/utils/jwt.js");
const { newId } = await import("../../src/utils/ids.js");

const user = { id: "t1", role: "teacher", name: "Priya Sharma", departmentId: "d-sci", schoolId: "one" };

test("the token carries what the other services need", () => {
  const p = verifyToken(signToken(user));
  assert.equal(p.sub, "t1");
  assert.equal(p.role, "teacher");
  assert.equal(p.name, "Priya Sharma");
  assert.equal(p.departmentId, "d-sci");
  assert.equal(p.schoolId, "one");
});

test("the token expires (has an exp time)", () => {
  const p = verifyToken(signToken(user));
  assert.ok(p.exp > p.iat);
});

test("a token made with another secret is refused", async () => {
  const { default: jwt } = await import("jsonwebtoken");
  const forged = jwt.sign({ sub: "t1", role: "admin" }, "someone-elses-secret");
  assert.throws(() => verifyToken(forged));
});

test("an expired token is refused", async () => {
  const { default: jwt } = await import("jsonwebtoken");
  const old = jwt.sign({ sub: "t1", role: "teacher", exp: Math.floor(Date.now() / 1000) - 60 }, "unit-test-secret");
  assert.throws(() => verifyToken(old), /expired/);
});

test("new ids are strings with the given prefix", () => {
  const id = newId("hol");
  assert.match(id, /^hol-[0-9a-f]{24}$/);
  assert.notEqual(newId("hol"), id);
});