// Reads the request, calls the service, sends the response. No business logic here.
import { config } from '../config/index.js';
import * as authService from '../services/auth.service.js';
import { notFound, ok } from '../utils/response.js';
import { demoLoginBody, loginBody } from '../validations/auth.validation.js';

// Which school: the x-school-id header (from the top bar), or the default school
const schoolOf = (req) => req.get('x-school-id') || config.defaultSchoolId;

// POST /api/auth/login   { username, password } → { token, user }
export async function login(req, res) {
  const body = loginBody.parse(req.body);
  ok(res, await authService.login(schoolOf(req), body), 'Logged in');
}

// POST /api/auth/demo-login   { role } → { token, user }   (only when ALLOW_DEV_AUTH=true)
export async function demoLogin(req, res) {
  if (!config.allowDevAuth) throw notFound('Demo login is turned off.');
  const { role } = demoLoginBody.parse(req.body);
  ok(res, await authService.demoLogin(schoolOf(req), role), 'Logged in');
}

// GET /api/auth/me   (needs token) → the logged-in user
export async function me(req, res) {
  ok(res, await authService.me(req.user, req.ctx.schoolId));
}