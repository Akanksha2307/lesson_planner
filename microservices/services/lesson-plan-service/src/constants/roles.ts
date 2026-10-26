// The Qshikshak roles. The names are the exact strings the Auth service puts in the JWT.
export const ROLES = {
  TEACHER: "teacher",
  HOD: "hod",
  PRINCIPAL: "principal",
  ADMIN: "admin",
  PARENT: "parent",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Role groups used by the route configuration. Each group is the same list the
// old routes passed to allow(...).
export const ROLE_GROUPS = {
  // teacher, hod, admin, principal  – parents are NOT included
  STAFF: [ROLES.TEACHER, ROLES.HOD, ROLES.ADMIN, ROLES.PRINCIPAL],
  // teacher, hod, admin  – may create / edit lesson plans
  PLANNERS: [ROLES.TEACHER, ROLES.HOD, ROLES.ADMIN],
  // admin, hod, principal  – may edit the syllabus
  SYLLABUS_EDITORS: [ROLES.ADMIN, ROLES.HOD, ROLES.PRINCIPAL],
  // teacher only – marking, cancelling their own lessons
  TEACHER_ONLY: [ROLES.TEACHER],
  // teacher + admin – moving / swapping lessons (admin only while the plan is a draft or returned)
  ARRANGERS: [ROLES.TEACHER, ROLES.ADMIN],
  // admin, principal  – school settings, templates, holidays and exams
  MANAGERS: [ROLES.ADMIN, ROLES.PRINCIPAL],
} as const satisfies Record<string, readonly Role[]>;
