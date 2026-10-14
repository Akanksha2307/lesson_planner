
import { Router } from "express";
import { z } from "zod";

import { allow } from "../middleware/auth.js";
import { ok } from "../utils/response.js";

import { rescheduleItem } from "../services/reschedule.service.js";

const router = Router();

const rescheduleBody = z.object({
  date: z.string(),
  periodId: z.string().min(1),
  reason: z.string().trim().min(1)
});

router.post(
  "/plan-items/:id/reschedule",
  allow("teacher"),
  async (req, res) => {
    const body = rescheduleBody.parse(req.body);

    const result = await rescheduleItem(
      req.ctx,
      req.user,
      req.params.id,
      body
    );

    ok(res, result, "Lesson rescheduled successfully");
  }
);

export default router;
