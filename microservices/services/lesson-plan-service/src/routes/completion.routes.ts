import { Router } from "express";
import completionController from "../controllers/completion.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

// POST /api/lesson-planner/plan-items/:id/complete
registerRoute(router, "completePlanItem", completionController.complete);

export default router;
