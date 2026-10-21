// Login, /me, refresh and the internal accounts route – real app, test database, demo school.
import { INTERNAL_TOKEN } from '../helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_ACCOUNTS, startTestApp } from '../helpers/integration.js';

let t: Awaited<ReturnType<typeof startTestApp>>;
const login = (username: string, password: string) => request(t.app).post('/api/auth/login').send({ username, password });

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.stop();
});

test('t1 logs in with demo123 and gets tokens + user (no password)', async () => {
  const res = await login('t1', 'demo123');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken && res.body.data.refreshToken);
  assert.deepEqual(res.body.data.user, { id: 't1', name: 'Priya Sharma', role: 'teacher', departmentId: 'd-sci', schoolId: 'one' });
  assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
});

test('a wrong password and an unknown user → the same 401 message', async () => {
  assert.equal((await login('t1', 'wrong')).body.message, 'Wrong username or password.');
  assert.equal((await login('nobody', 'demo123')).body.message, 'Wrong username or password.');
});

test('every demo role can log in', async () => {
  for (const [u, role] of [['t3', 'hod'], ['p1', 'principal'], ['a1', 'admin'], ['pa1', 'parent']] as const) {
    const res = await login(u, 'demo123');
    assert.equal(res.status, 200, `${u} logs in`);
    assert.equal(res.body.data.user.role, role);
  }
});

test('GET /me with the access token', async () => {
  const { body } = await login('t3', 'demo123');
  const res = await request(t.app).get('/api/auth/me').set('Authorization', `Bearer ${body.data.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, 'Anitha Rao');
});

test('refresh rotates the token in MongoDB; the old one is then refused', async () => {
  const first = (await login('t1', 'demo123')).body.data;
  const r1 = await request(t.app).post('/api/auth/refresh-token').send({ refreshToken: first.refreshToken });
  assert.equal(r1.status, 200);
  const r2 = await request(t.app).post('/api/auth/refresh-token').send({ refreshToken: first.refreshToken });
  assert.equal(r2.status, 401);
});

test('logins created through /internal/accounts are stored with a bcrypt hash, never the password', async () => {
  const { Account } = await import('../../src/models/index.js');
  const doc = await Account.findById('t1').select('+passwordHash').lean();
  assert.ok(doc?.passwordHash?.startsWith('$2'));
  assert.notEqual(doc?.passwordHash, 'demo123');
});

test('syncing the same logins again updates them and keeps the count', async () => {
  const res = await request(t.app).put('/internal/accounts').set('x-internal-token', INTERNAL_TOKEN).send({ schoolId: 'one', accounts: DEMO_ACCOUNTS });
  assert.deepEqual(res.body.data, { created: 0, updated: DEMO_ACCOUNTS.length, loggedOut: 0 });
});

test('GET /health → 200 and db: up', async () => {
  const res = await request(t.app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.db, 'up');
});