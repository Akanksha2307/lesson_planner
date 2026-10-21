import { Request, Response } from "express";
import * as service from "../services/plan-items.service";
import { coverageReport, teacherReport } from "../services/reports.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams, validatedQuery } from "../utils/validated";
import { IdParams } from "../validations/common.validation";
import {
  AddPeriodsBody,
  CoverageQuery,
  HistoryQuery,
  ReasonBody,
  SwapBody,
  TargetBody
} from "../validations/plan-items.validation";

class PlanItemsController {
  async cancel(req: Request, res: Response): Promise<void> {
    const { reason } = validatedBody<ReasonBody>(req);
    const result = await service.cancelLesson(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, reason
    );
    ok(res, result, "Lesson cancelled");
  }

  async continue(req: Request, res: Response): Promise<void> {
    const result = await service.continueLesson(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<TargetBody>(req)
    );
    ok(res, result, "Lesson continued");
  }

  async move(req: Request, res: Response): Promise<void> {
    const result = await service.moveLesson(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<TargetBody>(req)
    );
    ok(res, result, "Lesson moved");
  }

  async swap(req: Request, res: Response): Promise<void> {
    const result = await service.swapLessons(req.ctx!, req.user!, validatedBody<SwapBody>(req));
    ok(res, result, "Lessons swapped");
  }

  async addPeriods(req: Request, res: Response): Promise<void> {
    const result = await service.addPeriods(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<AddPeriodsBody>(req)
    );
    ok(res, result, "Extra periods added");
  }

  async history(req: Request, res: Response): Promise<void> {
    const result = await service.listHistory(req.ctx!, req.user!, validatedQuery<HistoryQuery>(req));
    ok(res, result, "History loaded");
  }

  async coverage(req: Request, res: Response): Promise<void> {
    const { sectionId, subjectId } = validatedQuery<CoverageQuery>(req);
    const rows = await coverageReport(req.ctx!.schoolId, req.user!, { sectionId, subjectId });
    ok(res, rows, "Coverage report loaded");
  }

  async teachers(req: Request, res: Response): Promise<void> {
    ok(res, await teacherReport(req.ctx!.schoolId, req.user!), "Teacher report loaded");
  }
}

export default new PlanItemsController();
