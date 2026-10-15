import { Router } from "express";
import { getHolidayImpact } from "../services/holiday-shift.service.js";

const router = Router();

router.get("/holidays/impact", async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({
        success: false,
        message: "Holiday date is required"
      });
    }

    const impact = await getHolidayImpact(req.ctx.schoolId, date);

    return res.json({
      success: true,
      data: { impact },
      message: "Holiday impact calculated"
    });
  } catch (error) {
    next(error);
  }
});

export default router;