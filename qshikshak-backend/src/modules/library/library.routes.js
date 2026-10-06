// Lesson library API  –  mounted at /api/lesson-planner
//
//   GET /library?q=&subjectId=&topicId=    approved lessons, newest per topic + teacher
import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../../common/auth.js';
import { ok } from '../../common/response.js';
import { listLibrary } from './library.service.js';

const router = Router();
const query = z.object({ q: z.string().max(100).optional(), subjectId: z.string().optional(), topicId: z.string().optional() });

router.get('/library', allow('teacher', 'hod', 'admin', 'principal'), async (req, res) => {
  ok(res, await listLibrary(req.ctx, query.parse(req.query)));
});

export default router;
