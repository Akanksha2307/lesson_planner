// /api/lesson-planner/...   (everyone here is already logged in – see routes/index.js)
import { Router } from 'express';
import * as masters from '../controllers/masters.controller.js';
import { MANAGERS } from '../constants/roles.js';
import { allow } from '../middleware/authenticate.js';

const router = Router();

router.get('/masters', masters.getMasters);
router.put('/settings', allow(...MANAGERS), masters.saveSettings);
router.put('/templates/:id', allow(...MANAGERS), masters.saveTemplate);

export default router;