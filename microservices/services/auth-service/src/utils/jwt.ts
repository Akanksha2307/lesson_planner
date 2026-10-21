// Signing and checking tokens. Algorithm is pinned to HS256 on BOTH sides, so a token
// signed with "none" or another algorithm is always rejected.
import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env.js';
import { isRole } from '../constants/roles.js';
import type { AccessTokenPayload, AuthUser, RefreshTokenPayload } from '../types/auth.types.js';

const ALGORITHM = 'HS256' as const;
const common = { issuer: config.jwt.issuer, audience: config.jwt.audience };

export function signAccessToken(user: AuthUser & { name: string }): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    name: user.name,
    departmentId: user.departmentId ?? null,
    schoolId: user.schoolId,
    type: 'access',
  };
  return jwt.sign(payload, config.jwt.accessSecret, {
    ...common,
    algorithm: ALGORITHM,
    expiresIn: config.jwt.accessExpiresIn as SignOptions['expiresIn'],
    jwtid: randomUUID(),
  });
}

export function signRefreshToken(userId: string, schoolId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, schoolId, sid: sessionId, type: 'refresh' };
  return jwt.sign(payload, config.jwt.refreshSecret, {
    ...common,
    algorithm: ALGORITHM,
    expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'],
    jwtid: randomUUID(),
  });
}

// Throws (JsonWebTokenError / TokenExpiredError) if the token is wrong, expired or not an access token
export function verifyAccessToken(token: string): AccessTokenPayload {
  const p = jwt.verify(token, config.jwt.accessSecret, { ...common, algorithms: [ALGORITHM] });
  if (typeof p !== 'object' || p.type !== 'access' || typeof p.sub !== 'string' || !isRole(p.role) || typeof p.schoolId !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return p as unknown as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const p = jwt.verify(token, config.jwt.refreshSecret, { ...common, algorithms: [ALGORITHM] });
  if (typeof p !== 'object' || p.type !== 'refresh' || typeof p.sub !== 'string' || typeof p.sid !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return p as unknown as RefreshTokenPayload;
}

// Seconds until the access token expires (sent to the frontend as expiresIn)
export const secondsUntilExpiry = (token: string): number => {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : 0;
};
