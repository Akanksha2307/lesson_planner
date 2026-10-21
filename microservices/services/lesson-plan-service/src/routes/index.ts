import { Router } from "express";
import syllabusRoutes from "./syllabus.routes";
import libraryRoutes from "./library.routes";
import plansRoutes from "./plans.routes";
import todayRoutes from "./today.routes";
import calendarRoutes from "./calendar.routes";
import completionRoutes from "./completion.routes";
import rescheduleRoutes from "./reschedule.routes";
import planItemsRoutes from "./plan-items.routes";
import holidayRoutes from "./holiday.routes";
import aiRoutes from "./ai.routes";
import mastersRoutes from "./masters.routes";
import examsRoutes from "./exams.routes";

// Everything under /api/lesson-planner. app.ts runs authenticate before this router.
// The mount order is the same as before the refactor.
const apiRouter = Router();

apiRouter.use(syllabusRoutes);
apiRouter.use(libraryRoutes);
apiRouter.use(plansRoutes);
apiRouter.use(todayRoutes);
apiRouter.use(calendarRoutes);
apiRouter.use(completionRoutes);
apiRouter.use(rescheduleRoutes);
apiRouter.use(planItemsRoutes);
apiRouter.use(holidayRoutes);
apiRouter.use(examsRoutes);
apiRouter.use(mastersRoutes);
apiRouter.use(aiRoutes);

export default apiRouter;
