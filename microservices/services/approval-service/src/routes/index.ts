// Every route of approval-service, registered from config/route.config.ts.
// The security and validation of each route come from that file – nothing is repeated here.
import { Router, type RequestHandler } from 'express';
import { routeConfig, type RouteDefinition, type RouteName } from '../config/route.config.js';
import * as approvals from '../controllers/approval.controller.js';
import * as notifications from '../controllers/notification.controller.js';
import { authenticate, internalOnly, requireRoles } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

// One controller per route name – TypeScript fails if a route has no controller, or a controller no route
const controllers: Record<RouteName, RequestHandler> = {
  reviewPlan: approvals.reviewPlan,
  listApprovals: approvals.listApprovals,
  getApprovalHistory: approvals.getApprovalHistory,
  getApproval: approvals.getApproval,
  getSubmission: approvals.getSubmission,
  listNotifications: notifications.listNotifications,
  markNotificationsRead: notifications.markNotificationsRead,
  notify: notifications.notify,
};

function guardsFor(route: RouteDefinition): RequestHandler[] {
  if (route.internal) return [internalOnly];
  return [authenticate, ...(route.roles ? [requireRoles(route.roles)] : [])];
}

const router = Router();

// Registered in the order of route.config.ts (so /approvals/log/:planId comes before /approvals/:id)
for (const [name, route] of Object.entries(routeConfig) as Array<[RouteName, RouteDefinition]>) {
  const schemas = { params: route.params, query: route.query, body: route.body };
  router[route.method](route.path, ...guardsFor(route), validate(schemas), controllers[name]);
}

export default router;
