import { Router } from "express";
import examsController from "../controllers/exams.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "listExams", examsController.list);
registerRoute(router, "createExam", examsController.create);
registerRoute(router, "updateExam", examsController.update);
registerRoute(router, "deleteExam", examsController.remove);

export default router;
