import { Router } from 'express';
import { allow } from '../../common/auth.js';
import { ok } from '../../common/response.js';
import * as service from './masters.service.js';
import { settingsBody, templateBody } from './masters.validation.js';

const router = Router();
const managers = allow('admin', 'principal');

// GET /masters – anyone logged in: classes, staff, timetable, holidays, … (same as the mock)
router.get('/masters', async (req, res) => {
  ok(res, await service.getMasters(req.ctx));
});

// PUT /settings – admin, principal
router.put('/settings', managers, async (req, res) => {
  const changes = settingsBody.parse(req.body);
  ok(res, await service.saveSettings(req.ctx, changes), 'Settings saved');
});

// PUT /templates/:id – admin, principal
router.put('/templates/:id', managers, async (req, res) => {
  const body = templateBody.parse(req.body);
  ok(res, await service.saveTemplate(req.ctx, req.params.id, body), 'Template saved');
});

export default router;