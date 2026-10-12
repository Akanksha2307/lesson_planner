import * as mastersService from '../services/masters.service.js';
import { ok } from '../utils/response.js';
import { settingsBody, templateBody } from '../validations/masters.validation.js';

// GET /api/lesson-planner/masters – classes, staff, timetable, holidays, … (same as the mock)
export async function getMasters(req, res) {
  ok(res, await mastersService.getMasters(req.ctx));
}

// PUT /api/lesson-planner/settings – admin, principal
export async function saveSettings(req, res) {
  const changes = settingsBody.parse(req.body);
  ok(res, await mastersService.saveSettings(req.ctx, changes), 'Settings saved');
}

// PUT /api/lesson-planner/templates/:id – admin, principal
export async function saveTemplate(req, res) {
  const body = templateBody.parse(req.body);
  ok(res, await mastersService.saveTemplate(req.ctx, req.params.id, body), 'Template saved');
}