import { Router } from 'express';
import { allow } from '../../common/auth.js';
import { ok } from '../../common/response.js';
import * as service from './syllabus.service.js';
import { addTopicBody, getSyllabusQuery, importSyllabusBody, saveSyllabusBody } from './syllabus.validation.js';

const router = Router();
const editors = allow('admin', 'hod', 'principal');

// GET /syllabus?classId=c8&subjectId=sci   – anyone logged in
router.get('/syllabus', async (req, res) => {
  const query = getSyllabusQuery.parse(req.query);
  const syl = await service.getSyllabus(req.ctx, query);
  ok(res, syl ? syl.toJSON() : null);
});

// PUT /syllabus   – admin, HOD, principal
router.put('/syllabus', editors, async (req, res) => {
  const body = saveSyllabusBody.parse(req.body);
  const syl = await service.saveSyllabus(req.ctx, req.user, body);
  ok(res, syl.toJSON(), 'Syllabus saved');
});

// POST /syllabus/import   – admin, HOD, principal
router.post('/syllabus/import', editors, async (req, res) => {
  const body = importSyllabusBody.parse(req.body);
  const { syllabus, skippedRows } = await service.importSyllabus(req.ctx, req.user, body);
  const note = skippedRows.length ? ` (${skippedRows.length} row(s) skipped – missing chapter or topic)` : '';
  ok(res, { ...syllabus.toJSON(), skippedRows }, `Syllabus imported${note}`);
});

// POST /syllabus/:id/topics   – teacher, HOD, admin, principal
router.post('/syllabus/:id/topics', allow('teacher', 'hod', 'admin', 'principal'), async (req, res) => {
  const body = addTopicBody.parse(req.body);
  const { syllabus, topic } = await service.addTopic(req.ctx, req.user, req.params.id, body);
  ok(res, { syllabus: syllabus.toJSON(), topic }, 'Topic added to the syllabus', 201);
});

export default router;