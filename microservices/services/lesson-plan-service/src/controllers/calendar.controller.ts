import { Request, Response } from "express";
import { getCalendar } from "../services/calendar.service";
import { validatedQuery } from "../utils/validated";
import { CalendarQuery } from "../validations/calendar.validation";

class CalendarController {
  async get(req: Request, res: Response): Promise<void> {
    const data = await getCalendar(
      req.ctx!,
      req.user!,
      validatedQuery<CalendarQuery>(req)
    );

    res.json({
      success: true,
      data,
      message: "OK"
    });
  }
}

export default new CalendarController();
