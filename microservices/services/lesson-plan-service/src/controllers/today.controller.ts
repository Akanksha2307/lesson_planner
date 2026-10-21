import { Request, Response } from "express";
import { getToday } from "../services/today.service";
import { validatedQuery } from "../utils/validated";
import { TodayQuery } from "../validations/today.validation";

class TodayController {
  async get(req: Request, res: Response): Promise<void> {
    const { date } = validatedQuery<TodayQuery>(req);

    const requestedDate =
      date || new Date().toISOString().slice(0, 10);

    const data = await getToday(req.ctx!, req.user!, requestedDate);

    res.json({
      success: true,
      data,
      message: "OK"
    });
  }
}

export default new TodayController();
