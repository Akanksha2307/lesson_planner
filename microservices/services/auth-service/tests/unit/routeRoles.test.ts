// The route → roles map: complete, and it really protects every route.
import '../helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROUTE_ROLES } from '../../src/config/routeRoles.js';
import { ALL_ROLES } from '../../src/constants/roles.js';
import { secureRouter } from '../../src/routes/secureRouter.js';

test('loading the app does not throw: every route is in the map and every entry has a route', async () => {
  await assert.doesNotReject(import('../../src/app.js'));
});

test('a route that is NOT in the map stops the service from starting', () => {
  const r = secureRouter('/api/auth');
  assert.throws(() => r.get('/secret-report', (_q, s) => void s.end()), /not in config\/routeRoles\.ts/);
});

test('only login, refresh-token and demo-login are public', () => {
  const pub = Object.entries(ROUTE_ROLES).filter(([, a]) => a.kind === 'public').map(([k]) => k).sort();
  assert.deepEqual(pub, ['POST /api/auth/demo-login', 'POST /api/auth/login', 'POST /api/auth/refresh-token']);
});

test('every /internal route is INTERNAL, and nothing else is', () => {
  for (const [key, access] of Object.entries(ROUTE_ROLES)) {
    assert.equal(access.kind === 'internal', key.includes(' /internal/'), key);
  }
});

test('every role list only uses real roles and is never empty', () => {
  for (const [key, access] of Object.entries(ROUTE_ROLES)) {
    if (access.kind !== 'roles') continue;
    assert.ok(access.roles.length > 0, key);
    for (const role of access.roles) assert.ok(ALL_ROLES.includes(role), `${key}: ${role}`);
  }
});