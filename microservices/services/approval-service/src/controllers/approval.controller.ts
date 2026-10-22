// Reads the request, calls the service, sends the answer. No business logic here.
// Express 5 passes errors from async handlers to the error middleware by itself – no try/catch needed.
import type { Request, Response } from 'express';
import { bodyOf, paramsOf, queryOf } from '../middleware/validation.middleware.js';
import * as approvals from '../services/approval.service.js';
import * as review from '../services/review.service.js';
import { unauthorized } from '../utils/AppError.js';
import { ok } from '../utils/response.js';
import type {
  approvalIdParams,
  listApprovalsQuery,
  planIdInPathParams,
  planIdParams,
  planReviewSchema,
} from '../validations/approval.validation.js';

const userOf = (req: Request) => {
  if (!req.user) throw unauthorized();
  return req.user;
};

// POST /plans/:id/review   { action: "approved" | "returned", comment }
export async function reviewPlan(req: Request, res: Response): Promise<void> {
  const body = bodyOf<typeof planReviewSchema>(req);
  const plan = await review.reviewPlan(userOf(req), paramsOf<typeof planIdParams>(req).id, body);
  ok(res, plan, body.action === 'approved' ? 'Plan approved' : 'Plan sent back');
}

// GET /approvals?status=
export async function listApprovals(req: Request, res: Response): Promise<void> {
  ok(res, await approvals.listApprovals(userOf(req), queryOf<typeof listApprovalsQuery>(req).status), 'Approval requests retrieved.');
}

// GET /approvals/:id
export async function getApproval(req: Request, res: Response): Promise<void> {
  ok(res, await approvals.getApproval(userOf(req), paramsOf<typeof approvalIdParams>(req).id), 'Approval request retrieved.');
}

// GET /approvals/log/:planId
export async function getApprovalHistory(req: Request, res: Response): Promise<void> {
  ok(res, await approvals.getApprovalHistory(userOf(req), paramsOf<typeof planIdInPathParams>(req).planId), 'Approval history retrieved.');
}

// GET /submissions/:planId
export async function getSubmission(req: Request, res: Response): Promise<void> {
  ok(res, await approvals.getSubmission(userOf(req), paramsOf<typeof planIdInPathParams>(req).planId), 'Submission details retrieved.');
}
