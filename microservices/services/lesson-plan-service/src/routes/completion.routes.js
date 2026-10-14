import { Router } from "express";

import { allow } from "../middleware/auth.js";

import { ok } from "../utils/response.js";

import { completeItemBody } from "../validations/completion.validation.js";

import { completeItem } from "../services/completion.service.js";

const router = Router();

// POST /api/lesson-planner/plan-items/:id/complete
router.post(
  "/plan-items/:id/complete",
  allow("teacher"),
  async (req, res) => {
    const completion = completeItemBody.parse(req.body);

    const result = await completeItem(
      req.ctx,
      req.user,
      req.params.id,
      completion
    );

    ok(
      res,
      result,
      result.isEdit
        ? "Marking updated"
        : "Lesson marked"
    );
  }
);

export default router;