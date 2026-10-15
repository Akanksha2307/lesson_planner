// /internal/...   (only other services – see middleware/internalOnly.js)
//   POST /internal/notify   { schoolId, to: ["t1","t3"], title, text, link? }
//   Used by auth-service (holidays, exams) and any other service that wants to ring the bell.
import { Router } from "express";
import { z } from "zod";
import Notification from "../models/Notification.js";

const router = Router();

const notifyBody = z.object({
  schoolId: z.string().trim().min(1),
  to: z.array(z.string().trim().min(1)).min(1).max(500),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(2000),
  link: z.string().trim().max(300).optional().nullable(),
  type: z.string().trim().max(100).optional()
});

router.post("/notify", async (req, res) => {
  const result = notifyBody.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      data: null,
      message: "Validation failed",
      errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    });
  }

  const { schoolId, to, title, text, link, type } = result.data;
  try {
    // One notification per person (duplicates in "to" are removed)
    const docs = [...new Set(to)].map((recipientId) => ({
      schoolId,
      recipientId,
      type: type || "GENERAL",
      title,
      message: text,
      link: link || null
    }));
    await Notification.insertMany(docs);
    return res.status(201).json({ success: true, data: { created: docs.length }, message: "Notifications sent." });
  } catch (error) {
    console.error("Internal notify failed:", error);
    return res.status(500).json({ success: false, data: null, message: "Failed to create notifications." });
  }
});

export default router;