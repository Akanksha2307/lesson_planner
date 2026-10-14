
import { Router } from "express";
import { z } from "zod";

import { getCalendar } from "../services/calendar.service.js";

const router = Router();

const querySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  sectionId: z.string().optional(),
  subjectId: z.string().optional()
});

router.get("/calendar", async (req, res, next) => {
  try {
    const filters = querySchema.parse(req.query);

    if (filters.from > filters.to) {
      return res.status(400).json({
        success: false,
        message: "'from' must be before or equal to 'to'"
      });
    }

    if (!["teacher", "hod", "principal", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const data = await getCalendar(
      req.ctx,
      req.user,
      filters
    );

    return res.json({
      success: true,
      data,
      message: "OK"
    });
  } catch (error) {
    next(error);
  }
});

export default router;
