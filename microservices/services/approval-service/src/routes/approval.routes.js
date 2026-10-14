
import { Router } from "express";
import {
  approveByHod,
  approveByPrincipal,
  createApproval,
  getApprovalById,
  getApprovalHistory,
  getApprovals,
  reviewLessonPlan,
  sendBackByHod,
  sendBackByPrincipal
} from "../controllers/approval.controller.js";

import {
  authenticateToken,
  authorizeRoles
} from "../middleware/auth.middleware.js";

import {
  validateBody,
  createApprovalSchema,
  reviewSchema,
  lessonPlanReviewSchema
} from "../validations/approval.validation.js";

const router = Router();

router.use(authenticateToken);

// Required API 1: Submit a lesson plan.
router.post(
  "/plans/:id/submit",
  authorizeRoles("teacher"),
  validateBody(createApprovalSchema),
  createApproval
);

// Keep the existing submission route for compatibility.
router.post(
  "/",
  authorizeRoles("teacher"),
  validateBody(createApprovalSchema),
  createApproval
);

// Required API 4: List approvals.
router.get("/", getApprovals);

// Required API 5: Approval history.
router.get("/log/:planId", getApprovalHistory);

// Existing approval details route.
router.get("/:id", getApprovalById);

// Required API 3: HOD or Principal reviews a lesson plan.
router.post(
  "/plans/:id/review",
  authorizeRoles("hod", "principal"),
  validateBody(lessonPlanReviewSchema),
  reviewLessonPlan
);

// Existing HOD review routes.
router.patch(
  "/:id/hod/approve",
  authorizeRoles("hod"),
  validateBody(reviewSchema),
  approveByHod
);

router.patch(
  "/:id/hod/send-back",
  authorizeRoles("hod"),
  validateBody(reviewSchema),
  sendBackByHod
);

// Existing Principal review routes.
router.patch(
  "/:id/principal/approve",
  authorizeRoles("principal"),
  validateBody(reviewSchema),
  approveByPrincipal
);

router.patch(
  "/:id/principal/send-back",
  authorizeRoles("principal"),
  validateBody(reviewSchema),
  sendBackByPrincipal
);

export default router;
