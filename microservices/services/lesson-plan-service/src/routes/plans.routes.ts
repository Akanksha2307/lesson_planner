// Lesson Plan API  –  mounted at /api/lesson-planner   (parents cannot use these)
//
//   GET    /plans?status=          list (a teacher sees only their own plans)
//   GET    /plans/:id              one plan with all its lessons
//   POST   /plans/generate         create a plan from syllabus + timetable
//   DELETE /plans/:id              delete (only if no lesson is marked yet)
//   POST   /plans/:id/extend       add lessons up to a new end date
//   PATCH  /plan-items/:id         edit one lesson's details / topic
//   POST   /plans/:id/submit       send the plan for approval
import { Router } from "express";
import plansController from "../controllers/plans.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "listPlans", plansController.list);
registerRoute(router, "getPlan", plansController.getOne);
registerRoute(router, "generatePlan", plansController.generate);
registerRoute(router, "deletePlan", plansController.remove);
registerRoute(router, "extendPlan", plansController.extend);
registerRoute(router, "updatePlanItem", plansController.updateItem);
registerRoute(router, "submitPlan", plansController.submit);

export default router;
