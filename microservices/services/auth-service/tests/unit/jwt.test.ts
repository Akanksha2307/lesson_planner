// Tokens: signature, algorithm, expiry, issuer/audience and token type. No database.
import { ACCESS_SECRET } from '../helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../src/utils/jwt.js';

const user = { id: 't1', role: 'teacher' as const, name: 'Priya Sharma', departmentId: 'd-sci', schoolId: 'one' };

test('the access token carries what the other services need (CONTRACTS.md section 5)', () => {
  const p = verifyAccessToken(signAccessToken(user));
  assert.equal(p.sub, 't1');
  assert.equal(p.role, 'teacher');
  assert.equal(p.name, 'Priya Sharma');
  assert.equal(p.departmentId, 'd-sci');
  assert.equal(p.schoolId, 'one');
  assert.equal(p.type, 'access');
});

test('the access token is HS256, has exp, iss, aud and a unique jti', () => {
  const token = signAccessToken(user);
  const { header, payload } = jwt.decode(token, { complete: true }) as { header: jwt.JwtHeader; payload: jwt.JwtPayload };
  assert.equal(header.alg, 'HS256');
  assert.ok(payload.exp && payload.iat && payload.exp > payload.iat);
  assert.equal(payload.iss, 'qshikshak-auth');
  assert.equal(payload.aud, 'qshikshak');
  assert.notEqual(payload.jti, (jwt.decode(signAccessToken(user)) as jwt.JwtPayload).jti);
});

test('a token signed with another secret is rejected', () => {
  const forged = jwt.sign({ sub: 't1', role: 'admin', schoolId: 'one', type: 'access' }, 'some-other-secret-0123456789', {
    issuer: 'qshikshak-auth',
    audience: 'qshikshak',
  });
  assert.throws(() => verifyAccessToken(forged), jwt.JsonWebTokenError);
});

test('an unsigned token (alg: none) is rejected', () => {
  const none = jwt.sign({ sub: 't1', role: 'admin', schoolId: 'one', type: 'access' }, '', { algorithm: 'none' });
  assert.throws(() => verifyAccessToken(none), jwt.JsonWebTokenError);
});

test('an expired token is rejected with TokenExpiredError', () => {
  const old = jwt.sign({ sub: 't1', role: 'teacher', schoolId: 'one', type: 'access', exp: Math.floor(Date.now() / 1000) - 10 }, ACCESS_SECRET, {
    issuer: 'qshikshak-auth',
    audience: 'qshikshak',
  });
  assert.throws(() => verifyAccessToken(old), jwt.TokenExpiredError);
});

test('a token for another audience is rejected', () => {
  const t = jwt.sign({ sub: 't1', role: 'teacher', schoolId: 'one', type: 'access' }, ACCESS_SECRET, { issuer: 'qshikshak-auth', audience: 'other-app' });
  assert.throws(() => verifyAccessToken(t), jwt.JsonWebTokenError);
});

test('an unknown role in the token is rejected', () => {
  const t = jwt.sign({ sub: 't1', role: 'superuser', schoolId: 'one', type: 'access' }, ACCESS_SECRET, { issuer: 'qshikshak-auth', audience: 'qshikshak' });
  assert.throws(() => verifyAccessToken(t), jwt.JsonWebTokenError);
});

test('a refresh token can NOT be used as an access token, and the other way round', () => {
  const refresh = signRefreshToken('t1', 'one', 'ses-1');
  assert.throws(() => verifyAccessToken(refresh)); // different secret
  const refreshSignedWithAccessSecret = jwt.sign({ sub: 't1', schoolId: 'one', sid: 'ses-1', type: 'refresh', role: 'teacher' }, ACCESS_SECRET, {
    issuer: 'qshikshak-auth',
    audience: 'qshikshak',
  });
  assert.throws(() => verifyAccessToken(refreshSignedWithAccessSecret), /Invalid token payload/); // wrong type
  assert.throws(() => verifyRefreshToken(signAccessToken(user)));
  assert.equal(verifyRefreshToken(refresh).sid, 'ses-1');
});
