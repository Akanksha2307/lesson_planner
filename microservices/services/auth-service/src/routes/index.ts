// All URLs of auth-service in one place. Security for each one: config/routeRoles.ts
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import internalRoutes from './internal.routes.js';
import { assertRouteMapComplete } from './secureRouter.js';

const router = Router();

router.use('/api/auth', authRoutes); //   login, refresh-token, logout, demo-login, me
router.use('/internal', internalRoutes); // lesson-plan-service only: create / update logins

// Every route has an entry in routeRoles.ts and every entry has a route – or we do not start
assertRouteMapComplete();

export default router;