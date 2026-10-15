import { Router } from "express";
import { internalAuth } from "../middleware/internalAuth.js";
import { Plan, PlanItem } from "../models/plans.model.js";
import { shiftLessonsForHoliday } from "../services/holiday-shift.service.js";
const router = Router();

router.get("/plans/:id", internalAuth, async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id).lean();

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Lesson plan not found"
      });
    }

    const items = await PlanItem.find({
      planId: plan._id,
      schoolId: plan.schoolId
    }).lean();

    return res.json({
      success: true,
      data: {
        plan,
        items
      },
      message: "Lesson plan fetched successfully"
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /internal/plans/:id/status
// Called by Approval Service after a review decision.
router.patch("/plans/:id/status", internalAuth, async (req, res, next) => {
  try {
    const { status, reviewerId, comment = "", schoolId } = req.body;

    if (
      !schoolId ||
      typeof schoolId !== "string" ||
      !reviewerId ||
      typeof reviewerId !== "string" ||
      !["approved", "returned"].includes(status) ||
      typeof comment !== "string" ||
      comment.length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid schoolId, reviewerId and status are required"
      });
    }

    const plan = await Plan.findOne({
      _id: req.params.id,
      schoolId
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Lesson plan not found"
      });
    }

    if (plan.status !== "submitted") {
      return res.status(409).json({
        success: false,
        message: "Only submitted plans can be reviewed"
      });
    }

    const updated = await Plan.findOneAndUpdate(
      {
        _id: plan._id,
        schoolId,
        status: "submitted"
      },
      {
        $set: { status },
        $push: {
          reviews: {
            by: reviewerId,
            action: status,
            comment
          }
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Plan status changed during review"
      });
    }

    return res.json({
      success: true,
      data: updated.toJSON(),
      message: `Lesson plan ${status} successfully`
    });
  } catch (error) {
    next(error);
  }
});

// POST /internal/holiday-shift
// Called when an unexpected holiday is declared.

router.post("/holiday-shift", internalAuth, async (req, res, next) => {
  try {
    const { schoolId, date } = req.body || {};

    if (!schoolId || typeof schoolId !== "string") {
      return res.status(400).json({
        success: false,
        message: "schoolId is required"
      });
    }

    const result = await shiftLessonsForHoliday(schoolId, date);

    return res.json({
      success: true,
      data: result,
      message: "Holiday rescheduling completed"
    });

  } catch (error) {
    if (error.status === 400 || error.status === 409) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    next(error);
  }
});

export default router;