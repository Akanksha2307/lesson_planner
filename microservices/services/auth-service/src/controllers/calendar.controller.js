import * as calendar from '../services/calendar.service.js';
import { ok } from '../utils/response.js';
import { examBody, holidayBody } from '../validations/calendar.validation.js';

// GET /api/lesson-planner/holidays
export async function listHolidays(req, res) {
  ok(res, await calendar.listHolidays(req.ctx));
}

// POST /api/lesson-planner/holidays   ·   PUT /api/lesson-planner/holidays/:id
export async function saveHoliday(req, res) {
  const body = holidayBody.parse(req.body);
  const id = req.params.id;
  const holiday = await calendar.saveHoliday(req.ctx, req.user, id, body);
  ok(res, holiday, id ? 'Holiday updated' : 'Holiday added', id ? 200 : 201);
}

// DELETE /api/lesson-planner/holidays/:id
export async function deleteHoliday(req, res) {
  ok(res, await calendar.deleteHoliday(req.ctx, req.user, req.params.id), 'Holiday deleted');
}

// GET /api/lesson-planner/exams
export async function listExams(req, res) {
  ok(res, await calendar.listExams(req.ctx));
}

// POST /api/lesson-planner/exams   ·   PUT /api/lesson-planner/exams/:id
export async function saveExam(req, res) {
  const body = examBody.parse(req.body);
  const id = req.params.id;
  const exam = await calendar.saveExam(req.ctx, req.user, id, body);
  ok(res, exam, id ? 'Exam updated' : 'Exam added', id ? 200 : 201);
}

// DELETE /api/lesson-planner/exams/:id
export async function deleteExam(req, res) {
  ok(res, await calendar.deleteExam(req.ctx, req.user, req.params.id), 'Exam deleted');
}