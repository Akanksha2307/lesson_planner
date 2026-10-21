// The zod schemas on their own. No database, no HTTP.
import '../helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginBody, demoLoginBody, refreshBody } from '../../src/validations/auth.validation.js';
import { idParams } from '../../src/validations/common.validation.js';
import { accountsBody } from '../../src/validations/internal.validation.js';

test('login: username is trimmed, unknown fields are dropped', () => {
  const r = loginBody.parse({ username: '  t1 ', password: 'demo123', isAdmin: true });
  assert.deepEqual(r, { username: 't1', password: 'demo123' });
});

test('login: missing or empty fields fail with a clear message', () => {
  assert.equal(loginBody.safeParse({ username: 't1' }).error?.issues[0]?.message, 'Password is required');
  assert.equal(loginBody.safeParse({ username: '   ', password: 'x' }).error?.issues[0]?.message, 'Username is required');
});

test('demo-login: only real roles', () => {
  assert.ok(demoLoginBody.safeParse({ role: 'hod' }).success);
  assert.equal(demoLoginBody.safeParse({ role: 'superuser' }).success, false);
});

test('refresh-token: required', () => {
  assert.equal(refreshBody.safeParse({}).success, false);
});

test(':id params: no spaces, $ or slashes (no NoSQL tricks)', () => {
  assert.ok(idParams.safeParse({ id: 'hol-65f0a1' }).success);
  assert.equal(idParams.safeParse({ id: '$ne' }).success, false);
  assert.equal(idParams.safeParse({ id: '' }).success, false);
});

test('internal accounts: username lower-cased, defaults filled, password optional', () => {
  const r = accountsBody.parse({ schoolId: 'one', accounts: [{ id: 't1', username: ' T1 ', name: 'Priya', role: 'teacher' }] });
  assert.deepEqual(r.accounts[0], { id: 't1', username: 't1', name: 'Priya', role: 'teacher', departmentId: null, active: true });
});

test('internal accounts: duplicates, unknown roles and short passwords are rejected', () => {
  const a = { id: 't1', username: 't1', name: 'A', role: 'teacher' };
  assert.equal(accountsBody.safeParse({ schoolId: 'one', accounts: [a, a] }).success, false);
  assert.equal(accountsBody.safeParse({ schoolId: 'one', accounts: [{ ...a, role: 'superuser' }] }).success, false);
  assert.equal(accountsBody.safeParse({ schoolId: 'one', accounts: [{ ...a, password: '123' }] }).success, false);
  assert.equal(accountsBody.safeParse({ schoolId: 'one', accounts: [] }).success, false);
});