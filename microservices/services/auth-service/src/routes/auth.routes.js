// /api/auth/...
import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.post('/login', auth.login);
router.post('/demo-login', auth.demoLogin);
router.get('/me', authenticate, auth.me);

export default router;