import { Request, Response } from "express";
import { rescheduleItem } from "../services/reschedule.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams } from "../utils/validated";
import { RescheduleBody } from "../validations/reschedule.validation";
import { IdParams } from "../validations/common.validation";

class RescheduleController {
  async reschedule(req: Request, res: Response): Promise<void> {
    const result = await rescheduleItem(
      req.ctx!,
      req.user!,
      validatedParams<IdParams>(req).id,
      validatedBody<RescheduleBody>(req)
    );

    ok(res, result, "Lesson rescheduled successfully");
  }
}

export default new RescheduleController();
