// The middleware chain over real HTTP (supertest), without a database:
// CORS · body parser · content type · Bearer JWT · route → roles · request validation · errors
import { FRONTEND, INTERNAL_TOKEN } from '../helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import { signAccessToken, signRefreshToken } from '../../src/utils/jwt.js';

mongoose.set('bufferCommands', false); // a test that accidentally needs the DB fails fast

const bearer = (role: 'teacher' | 'hod' | 'principal' | 'admin' | 'parent') =>
  `Bearer ${signAccessToken({ id: 'x1', role, name: 'Test', departmentId: null, schoolId: 'one' })}`;

const expectShape = (body: Record<string, unknown>) => {
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(typeof body.message, 'string');
};

// ---------- CORS ----------

test('CORS: the frontend origin gets CORS headers', async () => {
  const res = await request(app).get('/health').set('Origin', FRONTEND);
  assert.equal(res.headers['access-control-allow-origin'], FRONTEND);
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
});

test('CORS: an unknown website gets NO CORS headers (the browser blocks it)', async () => {
  const res = await request(app).get('/health').set('Origin', 'https://evil.example');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('CORS: pre-flight (OPTIONS) allows Authorization and JSON', async () => {
  const res = await request(app)
    .options('/api/auth/login')
    .set('Origin', FRONTEND)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.equal(res.status, 204);
  assert.match(String(res.headers['access-control-allow-headers']), /Authorization/);
  assert.match(String(res.headers['access-control-allow-methods']), /POST/);
});

// ---------- Body parser / content type ----------

test('body parser: broken JSON → 400', async () => {
  const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"username": "t1",');
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'The request body is not valid JSON.');
  expectShape(res.body);
});

test('body parser: a body over the size limit → 413', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 't1', password: 'x'.repeat(20_000) });
  assert.equal(res.status, 413);
});

test('content type: plain text body → 415', async () => {
  const res = await request(app).post('/api/auth/login').set('Content-Type', 'text/plain').send('username=t1');
  assert.equal(res.status, 415);
});

// ---------- Authentication (Bearer JWT) ----------

test('no token → 401', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
  expectShape(res.body);
});

test('a broken token → 401', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.token');
  assert.equal(res.status, 401);
});

test('"Basic" instead of "Bearer" → 401', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', 'Basic dDE6ZGVtbzEyMw==');
  assert.equal(res.status, 401);
});

test('a REFRESH token sent as the Bearer token → 401', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signRefreshToken('t1', 'one', 'ses-1')}`);
  assert.equal(res.status, 401);
});

// ---------- Route → roles (internal) ----------

test('/internal without the internal token → 403, a user token does not help', async () => {
  assert.equal((await request(app).put('/internal/accounts').send({})).status, 403);
  assert.equal((await request(app).put('/internal/accounts').set('Authorization', bearer('admin')).send({})).status, 403);
});

test('validation (body) on an internal route: bad account list → 400 before any database call', async () => {
  const res = await request(app)
    .put('/internal/accounts')
    .set('x-internal-token', INTERNAL_TOKEN)
    .send({ schoolId: 'one', accounts: [{ id: '$ne', username: 'x', name: 'X', role: 'admin' }] });
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].location, 'body');
  assert.equal(res.body.errors[0].field, 'accounts.0.id');
});

test('school data is NOT here any more (it lives in lesson-plan-service)', async () => {
  assert.equal((await request(app).get('/api/lesson-planner/masters').set('Authorization', bearer('admin'))).status, 404);
  assert.equal((await request(app).get('/internal/school/one').set('x-internal-token', INTERNAL_TOKEN)).status, 404);
});

// ---------- Request validation (body, params) ----------

test('validation (body): missing password → 400 with location + field', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 't1' });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'password: Password is required');
  assert.deepEqual(res.body.errors, [{ location: 'body', field: 'password', message: 'Password is required' }]);
});

// ---------- Other ----------

test('unknown route → 404 in the standard shape', async () => {
  const res = await request(app).get('/api/nothing-here');
  assert.equal(res.status, 404);
  expectShape(res.body);
});

test('every answer has an X-Request-Id, and an incoming one is kept', async () => {
  const res = await request(app).get('/health').set('X-Request-Id', 'gateway-abc-123');
  assert.equal(res.headers['x-request-id'], 'gateway-abc-123');
  assert.ok((await request(app).get('/health')).headers['x-request-id']);
});

test('security headers are set and x-powered-by is hidden', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('/health without a database → 503 with db: down', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 503);
  assert.equal(res.body.data.db, 'down');
});