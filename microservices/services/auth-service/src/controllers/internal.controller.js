// For OTHER SERVICES only (lesson-plan-service, approval-service)
import { config } from '../config/index.js';
import { getSchoolForServices } from '../services/masters.service.js';
import { seedDemoSchool } from '../services/seed.service.js';
import { notFound, ok } from '../utils/response.js';

// GET /internal/school/:schoolId – classes, sections, subjects, departments (with hodId),
// staff, timetable, holidays, exams, templates, settings
export async function getSchool(req, res) {
  ok(res, await getSchoolForServices(req.params.schoolId));
}

// POST /internal/seed – load the demo school (development only)
export async function seed(req, res) {
  if (config.isProd) throw notFound('Seeding is turned off in production.');
  ok(res, await seedDemoSchool(req.body || {}), 'Demo school created');
}