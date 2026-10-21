// Who is calling?
//   authenticate   – reads "Authorization: Bearer <access token>", checks the JWT signature,
//                    expiry, issuer, audience and algorithm, then sets req.user.
//   requireRoles   – only these roles may continue (403 otherwise).
//   internalOnly   – /internal routes: the caller must send the shared x-internal-token.
// You normally do NOT add these by hand: secureRouter adds the right ones from config/routeRoles.ts.
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import { isRole, type Role } from '../constants/roles.js';
import { forbidden, unauthorized } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

function bearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const [scheme, token, extra] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra !== undefined) return null;
  return token;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);

  if (token) {
    // Wrong signature / expired / wrong type → the error handler answers 401
    const p = verifyAccessToken(token);
    req.user = { id: p.sub, role: p.role, name: p.name, departmentId: p.departmentId, schoolId: p.schoolId };
  } else if (config.allowDevAuth && req.get('x-user-id') && isRole(req.get('x-user-role'))) {
    // Development only: test without logging in
    req.user = {
      id: req.get('x-user-id') as string,
      role: req.get('x-user-role') as Role,
      schoolId: req.get('x-school-id') || config.defaultSchoolId,
    };
  } else {
    return next(unauthorized('Please log in. The Authorization: Bearer <token> header is missing.'));
  }
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
  const token = req.get('x-internal-token') ?? '';
  if (!sameSecret(token, config.internalToken)) return next(forbidden('Internal route.'));
  next();
}