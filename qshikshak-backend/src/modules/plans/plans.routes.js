// Lesson Plan API  –  mounted at /api/lesson-planner   (parents cannot use these)
//
//   GET    /plans?status=          list (a teacher sees only their own plans)
//   GET    /plans/:id              one plan with all its lessons
//   POST   /plans/generate         create a plan from syllabus + timetable
//   DELETE /plans/:id              delete (only if no lesson is marked yet)
//   POST   /plans/:id/extend       add lessons up to a new end date
//   PATCH  /plan-items/:id         edit one lesson's details / topic
import { Router } from 'express';
import { allow } from '../../common/auth.js';
import { ok } from '../../common/response.js';
import * as service from './plans.service.js';
import { extendBody, generateBody, listQuery, updateItemBody } from './plans.validation.js';

const router = Router();
const staffOnly = allow('teacher', 'hod', 'admin', 'principal');
const planners = allow('teacher', 'hod', 'admin');

router.get('/plans', staffOnly, async (req, res) => {
  ok(res, await service.listPlans(req.ctx, req.user, listQuery.parse(req.query)));
});

router.get('/plans/:id', staffOnly, async (req, res) => {
  ok(res, await service.getPlan(req.ctx, req.user, req.params.id));
});

router.post('/plans/generate', planners, async (req, res) => {
  const result = await service.generatePlan(req.ctx, req.user, generateBody.parse(req.body));
  ok(res, result, 'Plan created', 201);
});

router.delete('/plans/:id', planners, async (req, res) => {
  await service.deletePlan(req.ctx, req.user, req.params.id);
  ok(res, true, 'Plan deleted');
});

router.post('/plans/:id/extend', planners, async (req, res) => {
  const r = await service.extendPlan(req.ctx, req.user, req.params.id, extendBody.parse(req.body));
  ok(res, r, `${r.added} lesson${r.added === 1 ? '' : 's'} added – plan now ends on ${r.endDate}`);
});

router.patch('/plan-items/:id', planners, async (req, res) => {
  ok(res, await service.updateItem(req.ctx, req.user, req.params.id, updateItemBody.parse(req.body)), 'Lesson saved');
});

export default router;