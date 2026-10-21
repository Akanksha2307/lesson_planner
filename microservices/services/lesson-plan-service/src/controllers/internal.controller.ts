import { Request, Response } from "express";
import { Plan, PlanItem } from "../models/plans.model";
import { shiftLessonsForHoliday } from "../services/holiday-shift.service";
import { getSchoolForServices } from "../services/masters.service";
import { seedDemoSchool } from "../services/seed.service";
import { config } from "../config/index";
import { notFound } from "../utils/AppError";
import { ok } from "../utils/response";
import { validatedBody, validatedParams } from "../utils/validated";
import { IdParams } from "../validations/common.validation";
import { InternalHolidayShiftBody, InternalStatusBody } from "../validations/internal.validation";
import { SchoolIdParams } from "../validations/school.validation";

class InternalController {
  // GET /internal/school/:schoolId – classes, sections, subjects, departments (with hodId),
  // staff, timetable, holidays, exams, templates, settings (used by approval-service)
  async getSchool(req: Request, res: Response): Promise<void> {
    ok(res, await getSchoolForServices(validatedParams<SchoolIdParams>(req).schoolId));
  }

  // POST /internal/seed – load the demo school (development only)
  async seed(req: Request, res: Response): Promise<void> {
    if (config.isProd) throw notFound("Seeding is turned off in production.");
    ok(res, await seedDemoSchool(validatedBody<{ schoolId?: string } | undefined>(req) || {}), "Demo school created");
  }

  async getPlan(req: Request, res: Response): Promise<void> {
    const plan = await Plan.findById(validatedParams<IdParams>(req).id).lean();

    if (!plan) {
      res.status(404).json({
        success: false,
        message: "Lesson plan not found"
      });
      return;
    }

    const items = await PlanItem.find({
      planId: plan._id,
      schoolId: plan.schoolId
    }).lean();

    res.json({
      success: true,
      data: {
        plan,
        items
      },
      message: "Lesson plan fetched successfully"
    });
  }

  // PATCH /internal/plans/:id/status – called by the Approval service after a review decision.
  async setPlanStatus(req: Request, res: Response): Promise<void> {
    const { status, reviewerId, comment, schoolId } = validatedBody<InternalStatusBody>(req);

    const plan = await Plan.findOne({
      _id: validatedParams<IdParams>(req).id,
      schoolId
    });

    if (!plan) {
      res.status(404).json({
        success: false,
        message: "Lesson plan not found"
      });
      return;
    }

    if (plan.status !== "submitted") {
      res.status(409).json({
        success: false,
        message: "Only submitted plans can be reviewed"
      });
      return;
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
      res.status(409).json({
        success: false,
        message: "Plan status changed during review"
      });
      return;
    }

    res.json({
      success: true,
      data: updated.toJSON(),
      message: `Lesson plan ${status} successfully`
    });
  }

  // POST /internal/holiday-shift – called when an unexpected holiday is declared.
  async holidayShift(req: Request, res: Response): Promise<void> {
    const { schoolId, date } = validatedBody<InternalHolidayShiftBody>(req);

    try {
      const result = await shiftLessonsForHoliday(schoolId, date as string);

      res.json({
        success: true,
        data: result,
        message: "Holiday rescheduling completed"
      });
    } catch (error: any) {
      if (error.status === 400 || error.status === 409) {
        res.status(error.status).json({
          success: false,
          message: error.message
        });
        return;
      }

      throw error;
    }
  }
}

export default new InternalController();
