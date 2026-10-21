// Login → access + refresh token → /me → refresh (rotation) → reuse detection → logout.
// Uses in-memory repositories, so it runs without MongoDB.
import { INTERNAL_TOKEN } from '../helpers/env.js';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { installFakeRepositories, PASSWORD } from '../helpers/fakeRepositories.js';

let db: ReturnType<typeof installFakeRepositories>;
beforeEach(() => {
  db = installFakeRepositories();
});

const login = (username: string, password = PASSWORD) => request(app).post('/api/auth/login').send({ username, password });
const refresh = (refreshToken: string) => request(app).post('/api/auth/refresh-token').send({ refreshToken });
const me = (accessToken: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);

test('login gives an access token, a refresh token and the user (no password)', async () => {
  const res = await login('t1');
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.tokenType, 'Bearer');
  assert.ok(d.accessToken && d.refreshToken);
  assert.equal(d.token, d.accessToken, '"token" kept for the current frontend');
  assert.ok(d.expiresIn > 0 && d.expiresIn <= 15 * 60);
  assert.deepEqual(d.user, { id: 't1', name: 'Priya Sharma', role: 'teacher', departmentId: 'd-sci', schoolId: 'one' });
  assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
  assert.equal(db.sessions.size, 1);
  assert.equal([...db.sessions.values()][0]!.tokenHash.includes(d.refreshToken), false, 'only a hash is stored');
});

test('the username is not case-sensitive', async () => {
  assert.equal((await login('T1')).status, 200);
});

test('wrong password and unknown user get the SAME 401 message', async () => {
  const a = await login('t1', 'wrong');
  const b = await login('nobody');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.message, 'Wrong username or password.');
  assert.equal(b.body.message, a.body.message);
});

test('an inactive account cannot log in', async () => {
  db.staff.get('t1')!.active = false;
  assert.equal((await login('t1')).status, 401);
});

test('GET /me with the access token gives the logged-in user', async () => {
  const { body } = await login('t3');
  const res = await me(body.data.accessToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, 'Anitha Rao');
  assert.equal(res.body.data.role, 'hod');
});

test('refresh: new access + refresh token; the old refresh token stops working', async () => {
  const first = (await login('t1')).body.data;
  const res = await refresh(first.refreshToken);
  assert.equal(res.status, 200);
  const second = res.body.data;
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.equal((await me(second.accessToken)).status, 200);
  assert.equal(db.sessions.size, 1, 'same device session, rotated');
});

test('refresh: using an OLD refresh token again logs the user out on every device', async () => {
  const deviceA = (await login('t1')).body.data;
  const deviceB = (await login('t1')).body.data;
  const rotated = (await refresh(deviceA.refreshToken)).body.data;

  const replay = await refresh(deviceA.refreshToken); // copied token used again
  assert.equal(replay.status, 401);
  assert.equal((await refresh(rotated.refreshToken)).status, 401, 'device A is logged out');
  assert.equal((await refresh(deviceB.refreshToken)).status, 401, 'device B is logged out too');
});

test('refresh: an access token is not accepted as a refresh token', async () => {
  const { accessToken } = (await login('t1')).body.data;
  assert.equal((await refresh(accessToken)).status, 401);
});

test('refresh: deactivated after login → 401', async () => {
  const { refreshToken } = (await login('t1')).body.data;
  db.staff.get('t1')!.active = false;
  assert.equal((await refresh(refreshToken)).status, 401);
});

test('refresh: a role change shows up in the new access token', async () => {
  const { refreshToken } = (await login('t1')).body.data;
  db.staff.get('t1')!.role = 'hod';
  const res = await refresh(refreshToken);
  assert.equal(res.body.data.user.role, 'hod');
});

test('logout with the refresh token ends only that device', async () => {
  const a = (await login('t1')).body.data;
  const b = (await login('t1')).body.data;
  const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${a.accessToken}`).send({ refreshToken: a.refreshToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.sessionsEnded, 1);
  assert.equal((await refresh(a.refreshToken)).status, 401);
  assert.equal((await refresh(b.refreshToken)).status, 200);
});

test('logout without a refresh token ends every device', async () => {
  const a = (await login('t1')).body.data;
  await login('t1');
  const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${a.accessToken}`).send({});
  assert.equal(res.body.data.sessionsEnded, 2);
});

test('logout needs an access token', async () => {
  assert.equal((await request(app).post('/api/auth/logout').send({})).status, 401);
});

test('demo-login (ALLOW_DEV_AUTH=true) logs in as the first person with that role', async () => {
  const res = await request(app).post('/api/auth/demo-login').send({ role: 'principal' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.id, 'p1');
});

test('every role can log in and reach /me', async () => {
  for (const u of ['t1', 't3', 'p1', 'a1', 'pa1']) {
    const { accessToken } = (await login(u)).body.data;
    assert.equal((await me(accessToken)).status, 200, u);
  }
});

test('PUT /internal/accounts: lesson-plan-service creates a new login, and the person can log in', async () => {
  const res = await request(app)
    .put('/internal/accounts')
    .set('x-internal-token', INTERNAL_TOKEN)
    .send({ schoolId: 'one', accounts: [{ id: 't9', username: 'T9', name: 'New Teacher', role: 'teacher', departmentId: 'd-sci', password: 'welcome1' }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.created, 1);
  const r = await login('t9', 'welcome1');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.user, { id: 't9', name: 'New Teacher', role: 'teacher', departmentId: 'd-sci', schoolId: 'one' });
});

test('PUT /internal/accounts: a profile update keeps the password; deactivating logs the person out', async () => {
  const { refreshToken } = (await login('t1')).body.data;
  const sync = (active: boolean) =>
    request(app)
      .put('/internal/accounts')
      .set('x-internal-token', INTERNAL_TOKEN)
      .send({ schoolId: 'one', accounts: [{ id: 't1', username: 't1', name: 'Priya S.', role: 'hod', departmentId: 'd-sci', active }] });

  assert.equal((await sync(true)).body.data.updated, 1);
  const again = await login('t1'); // old password still works
  assert.equal(again.status, 200);
  assert.equal(again.body.data.user.role, 'hod');

  const off = await sync(false);
  assert.equal(off.body.data.loggedOut, 2, 'both sessions ended');
  assert.equal((await refresh(refreshToken)).status, 401);
  assert.equal((await login('t1')).status, 401);
});

test('PUT /internal/accounts needs the internal token; a user token is not enough', async () => {
  const { accessToken } = (await login('a1')).body.data;
  const body = { schoolId: 'one', accounts: [{ id: 'x', username: 'x', name: 'X', role: 'admin' }] };
  assert.equal((await request(app).put('/internal/accounts').send(body)).status, 403);
  assert.equal((await request(app).put('/internal/accounts').set('Authorization', `Bearer ${accessToken}`).send(body)).status, 403);
});