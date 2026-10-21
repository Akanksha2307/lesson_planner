// /api/auth/...   Who may call what: config/routeRoles.ts
import * as auth from '../controllers/auth.controller.js';
import { loginLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { demoLoginBody, loginBody, logoutBody, refreshBody } from '../validations/auth.validation.js';
import { secureRouter } from './secureRouter.js';

const r = secureRouter('/api/auth');

r.post('/login', loginLimiter, validate({ body: loginBody }), auth.login);
r.post('/refresh-token', loginLimiter, validate({ body: refreshBody }), auth.refreshToken);
r.post('/logout', validate({ body: logoutBody }), auth.logout);
r.post('/demo-login', validate({ body: demoLoginBody }), auth.demoLogin);
r.get('/me', auth.me);

export default r.router;
