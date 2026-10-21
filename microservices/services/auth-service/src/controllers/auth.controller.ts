// Reads the request, calls the service, sends the response. No business logic here.
// Express 5 passes errors from async handlers to the error middleware by itself – no try/catch needed.
import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { bodyOf } from '../middleware/validation.middleware.js';
import * as authService from '../services/auth.service.js';
import { notFound, unauthorized } from '../utils/AppError.js';
import { ok } from '../utils/response.js';
import type { demoLoginBody, loginBody, logoutBody, refreshBody } from '../validations/auth.validation.js';
import { schoolIdHeader } from '../validations/common.validation.js';

// (the frontend sends an empty header before a school is picked – that means "the default school")
const schoolOf = (req: Request): string => schoolIdHeader.parse(req.get('x-school-id') || undefined) ?? config.defaultSchoolId;
const clientOf = (req: Request): authService.ClientInfo => ({ userAgent: req.get('user-agent') ?? '', ip: req.ip ?? '' });

// POST /api/auth/login   { username, password } → { accessToken, refreshToken, expiresIn, user }
export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = bodyOf<typeof loginBody>(req);
  ok(res, await authService.login(schoolOf(req), username, password, clientOf(req)), 'Logged in');
}

// POST /api/auth/refresh-token   { refreshToken } → new { accessToken, refreshToken, … }
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken } = bodyOf<typeof refreshBody>(req);
  ok(res, await authService.refresh(refreshToken), 'Token refreshed');
}

// POST /api/auth/logout   { refreshToken? }   (needs access token)
export async function logout(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { refreshToken } = bodyOf<typeof logoutBody>(req);
  ok(res, await authService.logout(req.user, refreshToken), 'Logged out');
}

// POST /api/auth/demo-login   { role } → tokens   (only when ALLOW_DEV_AUTH=true)
export async function demoLogin(req: Request, res: Response): Promise<void> {
  if (!config.allowDevAuth) throw notFound('Demo login is turned off.');
  const { role } = bodyOf<typeof demoLoginBody>(req);
  ok(res, await authService.demoLogin(schoolOf(req), role, clientOf(req)), 'Logged in');
}

// GET /api/auth/me   (needs access token) → the logged-in user
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  ok(res, await authService.me(req.user));
}
