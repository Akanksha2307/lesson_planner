import { Router } from "express";
import syllabusController from "../controllers/syllabus.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

// GET /syllabus?classId=c8&subjectId=sci   – anyone logged in
registerRoute(router, "getSyllabus", syllabusController.get);
// PUT /syllabus   – admin, HOD, principal
registerRoute(router, "saveSyllabus", syllabusController.save);
// POST /syllabus/import   – admin, HOD, principal
registerRoute(router, "importSyllabus", syllabusController.import);
// POST /syllabus/:id/topics   – teacher, HOD, admin, principal
registerRoute(router, "addSyllabusTopic", syllabusController.addTopic);

export default router;
