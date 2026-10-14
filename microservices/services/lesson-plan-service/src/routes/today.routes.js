import { Router } from "express";
import { z } from "zod";
import { getToday } from "../services/today.service.js";

const router = Router();

const querySchema = z.object({
  date: z.iso.date().optional()
});

router.get("/today", async (req, res, next) => {
  try {
    const { date } = querySchema.parse(req.query);

    const requestedDate =
      date || new Date().toISOString().slice(0, 10);

    const data = await getToday(req.ctx, req.user, requestedDate);

    res.json({
      success: true,
      data,
      message: "OK"
    });
  } catch (error) {
    next(error);
  }
});

export default router;