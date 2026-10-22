// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  THE ONE PLACE that describes every route of approval-service:               │
// │  method, path, who may call it, and the schemas its input must match.        │
// │                                                                              │
// │  roles     → logged-in users with one of these roles (403 for others)        │
// │  internal  → other services only (x-internal-token), no login token          │
// │  params / query / body → zod schemas, checked BEFORE the controller          │
// │                                                                              │
// │  routes/index.ts registers every entry, in this order, with                  │
// │    internal:  internalOnly → validate → controller                           │
// │    others:    authenticate → requireRoles → validate → controller            │
// └──────────────────────────────────────────────────────────────────────────────┘
import type { ZodType } from 'zod';
import { ALL_ROLES, REVIEWERS, STAFF, type Role } from '../constants/roles.js';
import {
  approvalIdParams,
  listApprovalsQuery,
  planIdInPathParams,
  planIdParams,
  planReviewSchema,
} from '../validations/approval.validation.js';
import { listNotificationsQuery, markReadBody, notifyBody } from '../validations/notification.validation.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDefinition {
  method: HttpMethod;
  /** Full path as the gateway forwards it */
  path: string;
  roles?: readonly Role[];
  internal?: true;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

const LP = '/api/lesson-planner';

export const routeConfig = {
  // ── Review: the HOD (or the principal when the HOD is unavailable) ──────────
  reviewPlan:          { method: 'post', path: `${LP}/plans/:id/review`,     roles: REVIEWERS, params: planIdParams, body: planReviewSchema },

  // ── Approval records and history (a teacher only sees their own) ────────────
  listApprovals:       { method: 'get',  path: `${LP}/approvals`,             roles: STAFF, query: listApprovalsQuery },
  getApprovalHistory:  { method: 'get',  path: `${LP}/approvals/log/:planId`, roles: STAFF, params: planIdInPathParams },
  getApproval:         { method: 'get',  path: `${LP}/approvals/:id`,         roles: STAFF, params: approvalIdParams },
  getSubmission:       { method: 'get',  path: `${LP}/submissions/:planId`,   roles: STAFF, params: planIdInPathParams },

  // ── Bell ────────────────────────────────────────────────────────────────────
  listNotifications:   { method: 'get',  path: `${LP}/notifications`,         roles: ALL_ROLES, query: listNotificationsQuery },
  markNotificationsRead: { method: 'post', path: `${LP}/notifications/read`, roles: ALL_ROLES, body: markReadBody },

  // ── Service to service (the gateway blocks /internal from outside) ──────────
  notify:              { method: 'post', path: '/internal/notify',            internal: true, body: notifyBody },
} as const satisfies Record<string, RouteDefinition>;

export type RouteName = keyof typeof routeConfig;
