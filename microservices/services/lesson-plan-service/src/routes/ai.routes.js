import { Router } from "express";
import { z } from "zod";

import { allow } from "../middleware/auth.js";
import { suggestLesson } from "../services/plans.engine.js";
import { ok } from "../utils/response.js";

const router = Router();

const suggestSchema = z.object({
  topicTitle: z.string().trim().min(1).max(300),
  minutes: z.number().int().min(1).max(600)
});

router.post(
  "/ai/suggest",
  allow("teacher", "hod", "principal", "admin"),
  (req, res, next) => {
    try {
      const { topicTitle, minutes } = suggestSchema.parse(req.body);

      const suggestion = suggestLesson(topicTitle, minutes);

      return ok(res, suggestion, "OK");
    } catch (error) {
      next(error);
    }
  }
);

export default router;