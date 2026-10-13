// Which service owns which URL. The FIRST matching rule wins,
// so the specific ones (submit / review) stay above the general "plans" rule.
import { config } from '../config/index.js';

const LP = '/api/lesson-planner';

export const RULES = [
  // auth-service: login + school data
  { match: /^\/api\/auth(\/|$)/, service: 'auth' },
  { match: new RegExp(`^${LP}/(masters|settings|templates)(/|$)`), service: 'auth' },

  // approval-service: submitting, reviewing, approvals list, notifications
  { match: new RegExp(`^${LP}/plans/[^/]+/(submit|review)$`), service: 'approval' },
  { match: new RegExp(`^${LP}/(approvals|submissions|notifications)(/|$)`), service: 'approval' },

  // lesson-plan-service: syllabus, plans, lessons, topic library
  { match: new RegExp(`^${LP}/(syllabus|library|plans|plan-items)(/|$)`), service: 'lessonPlan' },
];

// Names used in messages and in /api/health
export const NAMES = { auth: 'auth-service', lessonPlan: 'lesson-plan-service', approval: 'approval-service' };

// "/api/lesson-planner/plans/p1/submit" → { name: 'approval-service', url: 'http://localhost:5003' }
export function findService(path) {
  const rule = RULES.find((r) => r.match.test(path));
  return rule ? { name: NAMES[rule.service], url: config.services[rule.service] } : null;
}