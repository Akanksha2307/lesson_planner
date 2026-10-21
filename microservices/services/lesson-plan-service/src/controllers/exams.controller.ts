import { Request, Response } from "express";
import * as calendar from "../services/school-calendar.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams } from "../utils/validated";
import { ExamBody } from "../validations/exams.validation";
import { IdParams } from "../validations/common.validation";

class ExamsController {
  // GET /exams
  async list(req: Request, res: Response): Promise<void> {
    ok(res, await calendar.listExams(req.ctx!));
  }

  // POST /exams
  async create(req: Request, res: Response): Promise<void> {
    const exam = await calendar.saveExam(req.ctx!, req.user!, undefined, validatedBody<ExamBody>(req));
    ok(res, exam, "Exam added", 201);
  }

  // PUT /exams/:id
  async update(req: Request, res: Response): Promise<void> {
    const exam = await calendar.saveExam(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<ExamBody>(req)
    );
    ok(res, exam, "Exam updated");
  }

  // DELETE /exams/:id
  async remove(req: Request, res: Response): Promise<void> {
    ok(res, await calendar.deleteExam(req.ctx!, req.user!, validatedParams<IdParams>(req).id), "Exam deleted");
  }
}

export default new ExamsController();
