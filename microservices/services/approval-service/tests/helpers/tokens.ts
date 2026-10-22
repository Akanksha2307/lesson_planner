// approval-service only CHECKS tokens; auth-service makes them. Tests make a token exactly the way
// auth-service does (same secret, HS256, issuer, audience, payload).
import jwt from 'jsonwebtoken';
import type { Role } from '../../src/constants/roles.js';
import { ACCESS_SECRET } from './env.js';

export const accessToken = (id: string, role: Role, schoolId = 'one', secret = ACCESS_SECRET, extra: jwt.SignOptions = {}): string =>
  jwt.sign({ sub: id, role, name: id, departmentId: null, schoolId, type: 'access' }, secret, {
    algorithm: 'HS256',
    issuer: 'qshikshak-auth',
    audience: 'qshikshak',
    expiresIn: '15m',
    ...extra,
  });

export const tokenFor = (id: string, role: Role, schoolId = 'one'): string => `Bearer ${accessToken(id, role, schoolId)}`;
