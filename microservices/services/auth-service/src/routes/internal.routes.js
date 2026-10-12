// /internal/...   (only other services – see routes/index.js)
import { Router } from 'express';
import * as internal from '../controllers/internal.controller.js';

const router = Router();

router.get('/school/:schoolId', internal.getSchool);
router.post('/seed', internal.seed);

export default router;