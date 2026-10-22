// @ts-nocheck
import { z } from "zod";

export const createApprovalSchema = z.object({
  lessonPlanId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(100).optional().default(""),
  className: z.string().trim().max(100).optional().default(""),
  section: z.string().trim().max(50).optional().default("")
});

// API 1 gets lessonPlanId from the URL, so it is not required in the body.
export const planSubmissionSchema = createApprovalSchema.omit({
  lessonPlanId: true
});

export const reviewSchema = z.object({
  comment: z.string().trim().max(2000).optional().default("")
});

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    req.body = result.data;
    next();
  };
}

export const lessonPlanReviewSchema = reviewSchema.extend({
  action: z.enum(["approve", "send-back"])
});

// POST /api/lesson-planner/plans/:id/review – what the frontend sends:
//   { action: "approved" | "returned", comment, reviewerId }
// ("approve" / "send-back" are accepted too). reviewerId is ignored – the reviewer is the logged-in user.
export const planReviewSchema = z.object({
  action: z
    .enum(["approved", "returned", "approve", "send-back"])
    .transform((a) => (a === "approve" ? "approved" : a === "send-back" ? "returned" : a)),
  comment: z.string().trim().max(2000).optional().default(""),
  reviewerId: z.string().optional()
});