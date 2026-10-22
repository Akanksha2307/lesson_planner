// Who is calling?
//   authenticate  – reads "Authorization: Bearer <access token>" made by auth-service and checks its
//                   signature, expiry, issuer, audience, algorithm (HS256 only) and type ("access").
//   requireRoles  – only these roles may continue (403 otherwise).
//   internalOnly  – /internal routes: the caller must send the shared x-internal-token.
// You normally do NOT add these by hand: routes/index.ts adds them from config/route.config.ts.
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { isRole, type Role } from '../constants/roles.js';
import type { AccessTokenPayload } from '../types/auth.types.js';
import { forbidden, unauthorized } from '../utils/AppError.js';

function bearerToken(req: Request): string | null {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra !== undefined) return null;
  return token;
}

function verifyAccessToken(token: string): AccessTokenPayload {
  const p = jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ['HS256'],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
  if (typeof p !== 'object' || p.type !== 'access' || typeof p.sub !== 'string' || !isRole(p.role) || typeof p.schoolId !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return p as unknown as AccessTokenPayload;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) return next(unauthorized('Please log in. The Authorization: Bearer <token> header is missing.'));
  // A wrong / expired token throws – the error handler answers 401
  const p = verifyAccessToken(token);
  req.user = { id: p.sub, role: p.role, name: p.name, departmentId: p.departmentId ?? null, schoolId: p.schoolId };
  next();
}

export const requireRoles =
  (allowed: readonly Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!allowed.includes(req.user.role)) return next(forbidden());
    next();
  };

// Constant-time compare, so the token cannot be guessed one character at a time
const sameSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function internalOnly(req: Request, _res: Response, next: NextFunction): void {
  if (!sameSecret(req.get('x-internal-token') ?? '', config.internalToken)) {
    return next(unauthorized('Internal token is missing or wrong.'));
  }
  next();
}
