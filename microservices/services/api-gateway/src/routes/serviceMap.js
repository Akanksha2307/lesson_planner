
import { config } from '../config/index.js';

const LP = '/api/lesson-planner';

// The first matching rule wins.
export const RULES = [
  // Auth service: authentication only
  {
    match: /^\/api\/auth(\/|$)/,
    service: 'auth'
  },

  // Approval service
  {
    match: new RegExp(`^${LP}/plans/[^/]+/review$`),
    service: 'approval'
  },
  {
    match: new RegExp(`^${LP}/(approvals|submissions|notifications)(/|$)`),
    service: 'approval'
  },

  // Lesson Planner service: planning and school data
  {
    match: new RegExp(
      `^${LP}/(syllabus|library|plans|plan-items|today|calendar|history|reports|ai|masters|settings|templates|holidays|exams)(/|$)`
    ),
    service: 'lessonPlan'
  }
];

export const NAMES = {
  auth: 'auth-service',
  lessonPlan: 'lesson-plan-service',
  approval: 'approval-service'
};

export function findService(path) {
  const rule = RULES.find((r) => r.match.test(path));

  return rule
    ? {
        name: NAMES[rule.service],
        url: config.services[rule.service]
      }
    : null;
}
