import { Router } from "express";
import { z } from "zod";

import { allow } from "../middleware/auth.js";
import { ok } from "../utils/response.js";
import { listLibrary } from "../services/library.service.js";

const router = Router();

const query = z.object({
  q: z.string().max(100).optional(),
  subjectId: z.string().optional(),
  topicId: z.string().optional()
});

router.get(
  "/library",
  allow("teacher", "hod", "admin", "principal"),
  async (req, res) => {
    const filters = query.parse(req.query);

    const result = await listLibrary(req.ctx, filters);

    ok(res, result);
  }
);

export default router;