// Approval API  –  mounted at /api/lesson-planner
//
//   POST /plans/:id/submit     teacher (owner)                  → sends the plan to the HOD
//   POST /plans/:id/review     HOD of the subject, principal    { action: 'approved' | 'returned', comment }
//   GET  /approvals?status=    HOD, principal                   → plans this reviewer is responsible for
import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../../common/auth.js';
import { ok } from '../../common/response.js';
import * as service from './approvals.service.js';

const router = Router();

const reviewBody = z.object({
  action: z.enum(['approved', 'returned'], { error: 'action must be "approved" or "returned"' }),
  comment: z.string().max(2000).optional(),
});
const listQuery = z.object({ status: z.enum(['submitted', 'approved', 'returned']).default('submitted') });

router.post('/plans/:id/submit', allow('teacher'), async (req, res) => {
  const { plan, message } = await service.submitPlan(req.ctx, req.user, req.params.id);
  ok(res, plan, message);
});

router.post('/plans/:id/review', allow('hod', 'principal'), async (req, res) => {
  const { plan, message } = await service.reviewPlan(req.ctx, req.user, req.params.id, reviewBody.parse(req.body));
  ok(res, plan, message);
});

router.get('/approvals', allow('hod', 'principal'), async (req, res) => {
  ok(res, await service.listForReviewer(req.ctx, req.user, listQuery.parse(req.query)));
});

export default router;