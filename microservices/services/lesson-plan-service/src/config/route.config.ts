// ONE FILE that describes every Lesson Planner route:
//   method, path, who may call it, and the schemas its input must match.
//
// authorize.middleware.ts reads `roles`, validation.middleware.ts reads the
// schemas, and routes/*.routes.ts reads `method` + `path`. Nothing else
// repeats these lists.
//
//   roles omitted  → any logged-in user      (JWT is still required)
//   internal: true → service-to-service call (x-internal-token, no JWT / roles)
import { ZodType } from "zod";
import { Role, ROLE_GROUPS } from "../constants/roles";

import { idParams } from "../validations/common.validation";
import {
  generateBody,
  extendBody,
  listQuery,
  updateItemBody
} from "../validations/plans.validation";
import {
  addTopicBody,
  getSyllabusQuery,
  importSyllabusBody,
  saveSyllabusBody
} from "../validations/syllabus.validation";
import { completeItemBody } from "../validations/completion.validation";
import { libraryQuery } from "../validations/library.validation";
import { calendarQuery } from "../validations/calendar.validation";
import { todayQuery } from "../validations/today.validation";
import { suggestBody } from "../validations/ai.validation";
import { rescheduleBody } from "../validations/reschedule.validation";
import { holidayBody, holidayImpactQuery } from "../validations/holiday.validation";
import { examBody } from "../validations/exams.validation";
import { settingsBody, templateBody } from "../validations/masters.validation";
import { schoolIdParams, seedBody } from "../validations/school.validation";
import {
  addPeriodsBody,
  coverageQuery,
  historyQuery,
  reasonBody,
  swapBody,
  targetBody
} from "../validations/plan-items.validation";
import {
  internalHolidayShiftBody,
  internalStatusBody
} from "../validations/internal.validation";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDefinition {
  method: HttpMethod;
  /** Relative to the mount point: /api/lesson-planner, or /internal when `internal` is true */
  path: string;
  /** Roles allowed to call the route. Omit = any logged-in user. */
  roles?: readonly Role[];
  /** Service-to-service route guarded by x-internal-token instead of a JWT */
  internal?: boolean;
  bodySchema?: ZodType;
  querySchema?: ZodType;
  paramsSchema?: ZodType;
  /** Replaces the default "Validation failed" message (kept for old clients) */
  validationMessage?: string;
  /** Message becomes "field: reason" of the first problem (the style the school-data routes always used) */
  messageFromFirstIssue?: boolean;
}

const { STAFF, PLANNERS, SYLLABUS_EDITORS, TEACHER_ONLY, ARRANGERS, MANAGERS } = ROLE_GROUPS;

export const routeConfig = {
  // ───────────── Syllabus ─────────────
  getSyllabus: {
    method: "GET",
    path: "/syllabus",
    querySchema: getSyllabusQuery
  },
  saveSyllabus: {
    method: "PUT",
    path: "/syllabus",
    roles: SYLLABUS_EDITORS,
    bodySchema: saveSyllabusBody
  },
  importSyllabus: {
    method: "POST",
    path: "/syllabus/import",
    roles: SYLLABUS_EDITORS,
    bodySchema: importSyllabusBody
  },
  addSyllabusTopic: {
    method: "POST",
    path: "/syllabus/:id/topics",
    roles: STAFF,
    paramsSchema: idParams,
    bodySchema: addTopicBody
  },

  // ───────────── Library ─────────────
  listLibrary: {
    method: "GET",
    path: "/library",
    roles: STAFF,
    querySchema: libraryQuery
  },

  // ───────────── Lesson plans ─────────────
  listPlans: {
    method: "GET",
    path: "/plans",
    roles: STAFF,
    querySchema: listQuery
  },
  getPlan: {
    method: "GET",
    path: "/plans/:id",
    roles: STAFF,
    paramsSchema: idParams
  },
  generatePlan: {
    method: "POST",
    path: "/plans/generate",
    roles: PLANNERS,
    bodySchema: generateBody
  },
  previewPlan: {
    method: "POST",
    path: "/plans/preview",
    roles: PLANNERS,
    bodySchema: generateBody
  },
  deletePlan: {
    method: "DELETE",
    path: "/plans/:id",
    roles: PLANNERS,
    paramsSchema: idParams
  },
  extendPlan: {
    method: "POST",
    path: "/plans/:id/extend",
    roles: PLANNERS,
    paramsSchema: idParams,
    bodySchema: extendBody
  },
  updatePlanItem: {
    method: "PATCH",
    path: "/plan-items/:id",
    roles: PLANNERS,
    paramsSchema: idParams,
    bodySchema: updateItemBody
  },
  submitPlan: {
    method: "POST",
    path: "/plans/:id/submit",
    roles: PLANNERS,
    paramsSchema: idParams
  },

  // ───────────── Today / calendar ─────────────
  getToday: {
    method: "GET",
    path: "/today",
    querySchema: todayQuery
  },
  getCalendar: {
    method: "GET",
    path: "/calendar",
    roles: STAFF,
    querySchema: calendarQuery
  },

  // ───────────── Completion / delivery ─────────────
  completePlanItem: {
    method: "POST",
    path: "/plan-items/:id/complete",
    roles: TEACHER_ONLY,
    paramsSchema: idParams,
    bodySchema: completeItemBody
  },

  // ───────────── Rescheduling ─────────────
  reschedulePlanItem: {
    method: "POST",
    path: "/plan-items/:id/reschedule",
    roles: TEACHER_ONLY,
    paramsSchema: idParams,
    bodySchema: rescheduleBody
  },
  cancelPlanItem: {
    method: "POST",
    path: "/plan-items/:id/cancel",
    roles: TEACHER_ONLY,
    paramsSchema: idParams,
    bodySchema: reasonBody
  },
  continuePlanItem: {
    method: "POST",
    path: "/plan-items/:id/continue",
    roles: TEACHER_ONLY,
    paramsSchema: idParams,
    bodySchema: targetBody
  },
  movePlanItem: {
    method: "POST",
    path: "/plan-items/:id/move",
    roles: ARRANGERS,
    paramsSchema: idParams,
    bodySchema: targetBody
  },
  swapPlanItems: {
    method: "POST",
    path: "/plan-items/swap",
    roles: ARRANGERS,
    bodySchema: swapBody
  },
  addPlanItemPeriods: {
    method: "POST",
    path: "/plan-items/:id/add-periods",
    roles: TEACHER_ONLY,
    paramsSchema: idParams,
    bodySchema: addPeriodsBody
  },

  // ───────────── History & reports ─────────────
  getHistory: {
    method: "GET",
    path: "/history",
    roles: STAFF,
    querySchema: historyQuery
  },
  getCoverageReport: {
    method: "GET",
    path: "/reports/coverage",
    roles: STAFF,
    querySchema: coverageQuery
  },
  getTeacherReport: {
    method: "GET",
    path: "/reports/teachers",
    roles: STAFF
  },

  // ───────────── Holidays ─────────────
  getHolidayImpact: {
    method: "GET",
    path: "/holidays/impact",
    querySchema: holidayImpactQuery,
    validationMessage: "Holiday date is required"
  },

  // ───────────── School data: masters, settings, templates ─────────────
  getMasters: {
    method: "GET",
    path: "/masters"
  },
  saveSettings: {
    method: "PUT",
    path: "/settings",
    roles: MANAGERS,
    bodySchema: settingsBody,
    messageFromFirstIssue: true
  },
  saveTemplate: {
    method: "PUT",
    path: "/templates/:id",
    roles: MANAGERS,
    paramsSchema: idParams,
    bodySchema: templateBody,
    messageFromFirstIssue: true
  },

  // ───────────── School data: holidays (CRUD) ─────────────
  listHolidays: {
    method: "GET",
    path: "/holidays"
  },
  createHoliday: {
    method: "POST",
    path: "/holidays",
    roles: MANAGERS,
    bodySchema: holidayBody,
    messageFromFirstIssue: true
  },
  updateHoliday: {
    method: "PUT",
    path: "/holidays/:id",
    roles: MANAGERS,
    paramsSchema: idParams,
    bodySchema: holidayBody,
    messageFromFirstIssue: true
  },
  deleteHoliday: {
    method: "DELETE",
    path: "/holidays/:id",
    roles: MANAGERS,
    paramsSchema: idParams
  },

  // ───────────── School data: exams (CRUD) ─────────────
  listExams: {
    method: "GET",
    path: "/exams"
  },
  createExam: {
    method: "POST",
    path: "/exams",
    roles: MANAGERS,
    bodySchema: examBody,
    messageFromFirstIssue: true
  },
  updateExam: {
    method: "PUT",
    path: "/exams/:id",
    roles: MANAGERS,
    paramsSchema: idParams,
    bodySchema: examBody,
    messageFromFirstIssue: true
  },
  deleteExam: {
    method: "DELETE",
    path: "/exams/:id",
    roles: MANAGERS,
    paramsSchema: idParams
  },

  // ───────────── AI suggest ─────────────
  aiSuggest: {
    method: "POST",
    path: "/ai/suggest",
    roles: STAFF,
    bodySchema: suggestBody
  },

  // ───────────── Internal (other services) ─────────────
  internalGetPlan: {
    method: "GET",
    path: "/plans/:id",
    internal: true,
    paramsSchema: idParams
  },
  internalSetPlanStatus: {
    method: "PATCH",
    path: "/plans/:id/status",
    internal: true,
    paramsSchema: idParams,
    bodySchema: internalStatusBody,
    validationMessage: "Valid schoolId, reviewerId and status are required"
  },
  internalGetSchool: {
    method: "GET",
    path: "/school/:schoolId",
    internal: true,
    paramsSchema: schoolIdParams
  },
  internalSeed: {
    method: "POST",
    path: "/seed",
    internal: true,
    bodySchema: seedBody
  },
  internalHolidayShift: {
    method: "POST",
    path: "/holiday-shift",
    internal: true,
    bodySchema: internalHolidayShiftBody,
    validationMessage: "schoolId is required"
  }
} as const satisfies Record<string, RouteDefinition>;

export type RouteName = keyof typeof routeConfig;
