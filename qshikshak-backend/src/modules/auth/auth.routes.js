import { Router } from 'express';
import { z } from 'zod';
import { authenticate, ROLES } from '../../common/auth.js';
import { config } from '../../config/index.js';
import { notFound, ok } from '../../common/response.js';
import * as service from './auth.service.js';

const router = Router();

const loginBody = z.object({
  username: z.string({ error: 'Username is required' }).trim().min(1, 'Username is required').max(100),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});
const demoBody = z.object({ role: z.enum(ROLES) });

// Which school: the x-school-id header (from the top bar), or the default school
const schoolOf = (req) => req.get('x-school-id') || config.defaultSchoolId;

// POST /api/auth/login   { username, password }  →  { token, user }
router.post('/login', async (req, res) => {
  const body = loginBody.parse(req.body);
  ok(res, await service.login(schoolOf(req), body), 'Logged in');
});

// POST /api/auth/demo-login   { role }  →  { token, user }   (only when ALLOW_DEV_AUTH=true)
router.post('/demo-login', async (req, res) => {
  if (!config.allowDevAuth) throw notFound('Demo login is turned off.');
  const { role } = demoBody.parse(req.body);
  ok(res, await service.demoLogin(schoolOf(req), role), 'Logged in');
});

// GET /api/auth/me   (needs token)  →  the logged-in user
router.get('/me', authenticate, async (req, res) => {
  ok(res, await service.me(req.user, req.ctx.schoolId));
});

export default router;