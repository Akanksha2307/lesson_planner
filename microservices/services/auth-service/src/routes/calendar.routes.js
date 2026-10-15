// /api/lesson-planner/holidays and /exams   (everyone here is logged in – see routes/index.js)
//   anyone can read · only admin and principal can add, change or delete
import { Router } from 'express';
import * as calendar from '../controllers/calendar.controller.js';
import { MANAGERS } from '../constants/roles.js';
import { allow } from '../middleware/authenticate.js';

const router = Router();

router.get('/holidays', calendar.listHolidays);
router.post('/holidays', allow(...MANAGERS), calendar.saveHoliday);
router.put('/holidays/:id', allow(...MANAGERS), calendar.saveHoliday);
router.delete('/holidays/:id', allow(...MANAGERS), calendar.deleteHoliday);

router.get('/exams', calendar.listExams);
router.post('/exams', allow(...MANAGERS), calendar.saveExam);
router.put('/exams/:id', allow(...MANAGERS), calendar.saveExam);
router.delete('/exams/:id', allow(...MANAGERS), calendar.deleteExam);

export default router;