// Notifications API  –  mounted at /api/lesson-planner
//
//   GET  /notifications        the logged-in person's notifications (newest first, max 50)
//   POST /notifications/read   mark all of them as read
import { Router } from 'express';
import { ok } from '../../common/response.js';
import * as service from './notifications.service.js';

const router = Router();

router.get('/notifications', async (req, res) => {
  const list = await service.listFor(req.ctx, req.user);
  ok(res, list.map((n) => n.toJSON()));
});

router.post('/notifications/read', async (req, res) => {
  await service.markAllRead(req.ctx, req.user);
  ok(res, true);
});

export default router;
