import { Request, Response } from "express";
import { getHolidayImpact } from "../services/holiday-shift.service";
import * as calendar from "../services/school-calendar.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams, validatedQuery } from "../utils/validated";
import { HolidayBody, HolidayImpactQuery } from "../validations/holiday.validation";
import { IdParams } from "../validations/common.validation";

class HolidayController {
  // GET /holidays/impact?date=YYYY-MM-DD
  async impact(req: Request, res: Response): Promise<void> {
    const { date } = validatedQuery<HolidayImpactQuery>(req);

    const impact = await getHolidayImpact(req.ctx!.schoolId, date);

    res.json({
      success: true,
      data: { impact },
      message: "Holiday impact calculated"
    });
  }

  // GET /holidays
  async list(req: Request, res: Response): Promise<void> {
    ok(res, await calendar.listHolidays(req.ctx!));
  }

  // POST /holidays
  async create(req: Request, res: Response): Promise<void> {
    const holiday = await calendar.saveHoliday(req.ctx!, req.user!, undefined, validatedBody<HolidayBody>(req));
    ok(res, holiday, "Holiday added", 201);
  }

  // PUT /holidays/:id
  async update(req: Request, res: Response): Promise<void> {
    const holiday = await calendar.saveHoliday(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<HolidayBody>(req)
    );
    ok(res, holiday, "Holiday updated");
  }

  // DELETE /holidays/:id
  async remove(req: Request, res: Response): Promise<void> {
    ok(res, await calendar.deleteHoliday(req.ctx!, req.user!, validatedParams<IdParams>(req).id), "Holiday deleted");
  }
}

export default new HolidayController();
