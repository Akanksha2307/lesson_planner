// Cancel / continue / move / swap / extra periods, lesson history and reports.
// (Was routes/remaining.routes.js)
import { Router } from "express";
import planItemsController from "../controllers/plan-items.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "cancelPlanItem", planItemsController.cancel);
registerRoute(router, "continuePlanItem", planItemsController.continue);
registerRoute(router, "movePlanItem", planItemsController.move);
registerRoute(router, "swapPlanItems", planItemsController.swap);
registerRoute(router, "addPlanItemPeriods", planItemsController.addPeriods);
registerRoute(router, "getHistory", planItemsController.history);
registerRoute(router, "getCoverageReport", planItemsController.coverage);
registerRoute(router, "getTeacherReport", planItemsController.teachers);

export default router;
