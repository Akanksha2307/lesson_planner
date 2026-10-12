// All URLs of auth-service in one place
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { internalOnly } from '../middleware/internalOnly.js';
import authRoutes from './auth.routes.js';
import mastersRoutes from './masters.routes.js';
import internalRoutes from './internal.routes.js';

const router = Router();

router.use('/api/auth', authRoutes); //                             login, me
router.use('/api/lesson-planner', authenticate, mastersRoutes); //  needs a logged-in user
router.use('/internal', internalOnly, internalRoutes); //           needs the INTERNAL_TOKEN

export default router;