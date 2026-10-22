// The middleware chain over real HTTP (supertest), without a database or other services:
// CORS · body parser · Bearer JWT (made by auth-service) · route → roles · validation · error shape
import { FRONTEND, INTERNAL_TOKEN } from '../helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import { routeConfig } from '../../src/config/route.config.js';
import { accessToken, tokenFor } from '../helpers/tokens.js';

mongoose.set('bufferCommands', false); // a test that accidentally needs the DB fails fast

const LP = '/api/lesson-planner';
const expectShape = (body: Record<string, unknown>) => {
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(typeof body.message, 'string');
};

// ---------- the route file ----------

test('every route needs a login (with roles) or the internal token – nothing is public', () => {
  for (const [name, r] of Object.entries(routeConfig)) {
    const route = r as { internal?: boolean; roles?: readonly string[]; path: string };
    assert.ok(route.internal || (route.roles && route.roles.length > 0), name);
    assert.equal(Boolean(route.internal), route.path.startsWith('/internal/'), name);
  }
});

// ---------- CORS / body parser ----------

test('CORS: the frontend origin gets CORS headers, an unknown site does not', async () => {
  assert.equal((await request(app).get('/health').set('Origin', FRONTEND)).headers['access-control-allow-origin'], FRONTEND);
  assert.equal((await request(app).get('/health').set('Origin', 'https://evil.example')).headers['access-control-allow-origin'], undefined);
});

test('CORS pre-flight allows Authorization and the school / year / board headers', async () => {
  const res = await request(app)
    .options(`${LP}/notifications`)
    .set('Origin', FRONTEND)
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'authorization,x-school-id,x-academic-year-id,x-board-id');
  assert.equal(res.status, 204);
  const allowed = String(res.headers['access-control-allow-headers']);
  for (const h of ['Authorization', 'X-School-Id', 'X-Academic-Year-Id', 'X-Board-Id']) assert.match(allowed, new RegExp(h));
});

test('broken JSON → 400 in the standard shape', async () => {
  const res = await request(app).post('/internal/notify').set('x-internal-token', INTERNAL_TOKEN).set('Content-Type', 'application/json').send('{"to": [');
  assert.equal(res.status, 400);
  expectShape(res.body);
});

// ---------- Bearer token made by auth-service ----------

test('no token → 401', async () => {
  const res = await request(app).get(`${LP}/notifications`);
  assert.equal(res.status, 401);
  expectShape(res.body);
});

test('a token signed with another secret, an expired one, or one without type "access" → 401', async () => {
  const forged = accessToken('t1', 'teacher', 'one', 'some-other-secret-0123456789');
  const expired = accessToken('t1', 'teacher', 'one', undefined, { expiresIn: -10 });
  const noType = jwt.sign({ sub: 't1', role: 'teacher', schoolId: 'one' }, 'test-access-secret-0123456789', {
    issuer: 'qshikshak-auth',
    audience: 'qshikshak',
  });
  for (const t of [forged, expired, noType]) {
    assert.equal((await request(app).get(`${LP}/notifications`).set('Authorization', `Bearer ${t}`)).status, 401);
  }
});

// ---------- route → roles (before validation and before any database / service call) ----------

test('a teacher or a parent cannot review → 403', async () => {
  for (const who of [tokenFor('t1', 'teacher'), tokenFor('pa1', 'parent')]) {
    const res = await request(app).post(`${LP}/plans/plan-1/review`).set('Authorization', who).send({ action: 'approved' });
    assert.equal(res.status, 403);
    expectShape(res.body);
  }
});

test('a parent cannot read approval records → 403', async () => {
  assert.equal((await request(app).get(`${LP}/approvals`).set('Authorization', tokenFor('pa1', 'parent'))).status, 403);
  assert.equal((await request(app).get(`${LP}/submissions/plan-1`).set('Authorization', tokenFor('pa1', 'parent'))).status, 403);
});

test('/internal/notify: no token or a user token → 401', async () => {
  const body = { schoolId: 'one', to: ['t1'], title: 'x', text: 'y' };
  assert.equal((await request(app).post('/internal/notify').send(body)).status, 401);
  assert.equal((await request(app).post('/internal/notify').set('Authorization', tokenFor('a1', 'admin')).send(body)).status, 401);
});

// ---------- validation (params, query, body) ----------

test('validation (body): an unknown review action → 400 naming the field', async () => {
  const res = await request(app).post(`${LP}/plans/plan-1/review`).set('Authorization', tokenFor('t3', 'hod')).send({ action: 'delete' });
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].location, 'body');
  assert.equal(res.body.errors[0].field, 'action');
});

test('validation (params): a bad plan id or approval id → 400', async () => {
  const hod = tokenFor('t3', 'hod');
  assert.equal((await request(app).post(`${LP}/plans/$ne/review`).set('Authorization', hod).send({ action: 'approved' })).status, 400);
  assert.equal((await request(app).get(`${LP}/approvals/not-an-object-id`).set('Authorization', hod)).status, 400);
});

test('validation (query): an unknown status filter → 400', async () => {
  const res = await request(app).get(`${LP}/approvals?status=DELETED`).set('Authorization', tokenFor('t3', 'hod'));
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].location, 'query');
});

test('validation (body): marking invalid notification ids → 400', async () => {
  const res = await request(app).post(`${LP}/notifications/read`).set('Authorization', tokenFor('t1', 'teacher')).send({ notificationIds: ['x'] });
  assert.equal(res.status, 400);
});

// ---------- other ----------

test('unknown route → 404 in the standard shape', async () => {
  const res = await request(app).get(`${LP}/nothing-here`);
  assert.equal(res.status, 404);
  expectShape(res.body);
});

test('/health without a database → 503 with service name and db: down', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 503);
  assert.deepEqual(res.body.data, { service: 'approval-service', db: 'down' });
});
