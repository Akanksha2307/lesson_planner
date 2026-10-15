// /api/lesson-planner/approvals/...   (everyone here is logged in)
//   GET /approvals             approval records (a teacher sees only their own)
//   GET /approvals/log/:planId review history of one plan
//   GET /approvals/:id         one approval record
import { Router } from "express";
import { getApprovalById, getApprovalHistory, getApprovals } from "../controllers/approval.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticateToken);

router.get("/", getApprovals);
router.get("/log/:planId", getApprovalHistory);
router.get("/:id", getApprovalById);

export default router;