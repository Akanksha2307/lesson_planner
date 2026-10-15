// Which service owns which URL. The FIRST matching rule wins,
// so the specific ones (review) stay above the general "plans" rule.
import { config } from '../config/index.js';

const LP = '/api/lesson-planner';

export const RULES = [
  // auth-service: login + school data
  { match: /^\/api\/auth(\/|$)/, service: 'auth' },
  { match: new RegExp(`^${LP}/(masters|settings|templates)(/|$)`), service: 'auth' },

  // approval-service: reviewing, approvals list, notifications
  { match: new RegExp(`^${LP}/plans/[^/]+/review$`), service: 'approval' },
  { match: new RegExp(`^${LP}/(approvals|submissions|notifications)(/|$)`), service: 'approval' },

  // lesson-plan-service: syllabus, plans, lessons, calendar, reports and AI
  {
    match: new RegExp(`^${LP}/(syllabus|library|plans|plan-items|today|calendar|history|reports|ai)(/|$)`),
    service: 'lessonPlan'
  },

  // Holiday impact calculation belongs to lesson-plan-service
  {
    match: new RegExp(`^${LP}/holidays/impact$`),
    service: 'lessonPlan'
  },

  // Holiday and Examination CRUD belongs to auth-service
  {
    match: new RegExp(`^${LP}/(holidays|exams)(/|$)`),
    service: 'auth'
  },
];

// Names used in messages and in /api/health
export const NAMES = { auth: 'auth-service', lessonPlan: 'lesson-plan-service', approval: 'approval-service' };

// "/api/lesson-planner/today" → { name: 'lesson-plan-service', url: 'http://localhost:5002' }
export function findService(path) {
  const rule = RULES.find((r) => r.match.test(path));
  return rule ? { name: NAMES[rule.service], url: config.services[rule.service] } : null;
}