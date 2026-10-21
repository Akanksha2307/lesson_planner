import { Router } from "express";
import rescheduleController from "../controllers/reschedule.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "reschedulePlanItem", rescheduleController.reschedule);

export default router;
