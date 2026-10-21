// /internal/...  – only other services (shared x-internal-token)
import { Router } from "express";
import internalController from "../controllers/internal.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "internalGetSchool", internalController.getSchool);
registerRoute(router, "internalSeed", internalController.seed);
registerRoute(router, "internalGetPlan", internalController.getPlan);
registerRoute(router, "internalSetPlanStatus", internalController.setPlanStatus);
registerRoute(router, "internalHolidayShift", internalController.holidayShift);

export default router;
