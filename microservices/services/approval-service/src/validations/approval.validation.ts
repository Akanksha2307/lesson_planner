import { z } from 'zod';
import { idString, objectId } from './common.validation.js';

// POST /plans/:id/review   and   GET /approvals/log/:planId, /submissions/:planId
export const planIdParams = z.object({ id: idString('plan id') });
export const planIdInPathParams = z.object({ planId: idString('plan id') });

// GET /approvals/:id   (the approval record's own id)
export const approvalIdParams = z.object({ id: objectId('approval id') });

// GET /approvals?status=APPROVED
export const APPROVAL_STATUSES = ['SUBMITTED', 'SENT_BACK_TO_TEACHER', 'SENT_BACK_BY_PRINCIPAL', 'APPROVED'] as const;
export const listApprovalsQuery = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
});
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuery>;

// POST /plans/:id/review – what the frontend sends: { action: "approved" | "returned", comment, reviewerId }
// ("approve" / "send-back" are accepted too). reviewerId is ignored – the reviewer is the logged-in user.
export const planReviewSchema = z.object({
  action: z
    .enum(['approved', 'returned', 'approve', 'send-back'])
    .transform((a): 'approved' | 'returned' => (a === 'approve' || a === 'approved' ? 'approved' : 'returned')),
  comment: z.string().trim().max(2000).optional().default(''),
  reviewerId: z.string().optional(),
});
export type PlanReviewBody = z.infer<typeof planReviewSchema>;
