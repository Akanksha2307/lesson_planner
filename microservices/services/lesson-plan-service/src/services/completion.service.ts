import { RequestContext, AuthUser } from "../types";

import mongoose from "mongoose";

import {
  Plan,
  PlanItem,
  PLAN_STATUS,
  LESSON_STATUS
} from "../models/plans.model";

import {
  conflict,
  forbidden,
  notFound
} from "../utils/AppError";

import { loadSchool } from "./plans.service";

import {
  nextClassPeriod,
  continueCore,
  removeContinuation
} from "./completion-scheduling.service";

// -----------------------------------------
// Allowed completion statuses
// -----------------------------------------

const ALLOWED_STATUSES = [
  LESSON_STATUS.COMPLETED,
  LESSON_STATUS.PARTIAL,
  LESSON_STATUS.NOT_DONE
];

const UNFINISHED_STATUSES = [
  LESSON_STATUS.PARTIAL,
  LESSON_STATUS.NOT_DONE
];

// -----------------------------------------
// POST /plan-items/:id/complete
// -----------------------------------------

export async function completeItem(
  ctx: RequestContext,
  user: AuthUser,
  id: any,
  completion: any
) {
  if (!ALLOWED_STATUSES.includes(completion.status)) {
    throw conflict("Invalid lesson completion status.");
  }

  // ---------------------------------------
  // Debugging
  // ---------------------------------------


  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {

      // -----------------------------------
      // Find lesson
      // -----------------------------------

      const item = await PlanItem.findOne({
        _id: id,
        schoolId: ctx.schoolId
      }).session(session);


      if (!item) {
        throw notFound("Lesson not found.");
      }

      // -----------------------------------
      // Find lesson plan
      // -----------------------------------

      const plan = await Plan.findOne({
        _id: item.planId,
        schoolId: ctx.schoolId
      }).session(session);


      if (!plan) {
        throw notFound("Lesson plan not found.");
      }

      // -----------------------------------
      // Teacher authorization
      // -----------------------------------

      if (
        user.role !== "teacher" ||
        item.teacherId !== user.id ||
        plan.teacherId !== user.id
      ) {
        throw forbidden(
          "Only the assigned teacher can mark this lesson."
        );
      }

      // -----------------------------------
      // Validate lesson status
      // -----------------------------------

      if (
        item.status === LESSON_STATUS.CANCELLED ||
        item.status === LESSON_STATUS.RESCHEDULED
      ) {
        throw conflict(
          "Cancelled or rescheduled lessons cannot be marked."
        );
      }

      const previousStatus = item.status;

      const isEdit =
        previousStatus !== LESSON_STATUS.PLANNED;

      const school = await loadSchool(ctx.schoolId);

      let shifted: any[] = [];
      let continuedTo = null;
      let overflow = null;
      let pulledBack = 0;

      // -----------------------------------
      // Remove previous continuation
      // -----------------------------------

      if (
        completion.status === LESSON_STATUS.COMPLETED &&
        UNFINISHED_STATUSES.includes(previousStatus)
      ) {
        pulledBack = await removeContinuation(
          ctx,
          item,
          session
        );
      }

      // -----------------------------------
      // Save lesson completion
      // -----------------------------------

      item.status = completion.status;

      item.completion = {
        ...completion,
        at: new Date()
      };

      item.markModified("completion");

      item.history.push({
        at: new Date(),
        action: isEdit
          ? `marking changed from ${previousStatus} to ${completion.status}`
          : `marked ${completion.status}`,
        by: user.id
      });

      await item.save({ session });

      // -----------------------------------
      // Check plan approval restrictions
      // -----------------------------------

      const shiftBlocked =
        plan.status === PLAN_STATUS.SUBMITTED ||
        (
          plan.status === PLAN_STATUS.APPROVED &&
          school.settings?.approvalRequired &&
          school.settings?.editAfterApproval === "reapprove"
        );

      // -----------------------------------
      // Automatic continuation
      // -----------------------------------

      if (
        school.settings?.autoShift &&
        UNFINISHED_STATUSES.includes(completion.status)
      ) {
        const existingContinuation =
          await PlanItem.exists({
            schoolId: ctx.schoolId,
            planId: item.planId,
            continuationOf: String(item._id),
            status: LESSON_STATUS.PLANNED
          }).session(session);

        if (!existingContinuation) {

          if (shiftBlocked) {
            overflow = {
              topicTitle: item.topicTitle,
              reason:
                "Automatic shifting is blocked until this plan is editable."
            };
          } else {

            const target = await nextClassPeriod(
              ctx,
              item,
              session
            );

            if (!target) {
              overflow = {
                topicTitle: item.topicTitle,
                reason:
                  "No suitable timetable period within 120 days."
              };
            } else {

              try {
                const outcome = await continueCore(
                  ctx,
                  item,
                  target,
                  session
                );

                shifted = outcome.changed;

                const period =
                  school.period(target.periodId);

                continuedTo = {
                  date: target.date,
                  periodId: target.periodId,
                  periodLabel:
                    (period as any)?.label || target.periodId
                };

              } catch (error: any) {

                if (
                  [
                    "No free timetable period within 120 days.",
                    "Target period belongs to another lesson."
                  ].includes(error.message)
                ) {
                  overflow = {
                    topicTitle: item.topicTitle,
                    reason: error.message
                  };
                } else {
                  throw error;
                }
              }
            }
          }
        }
      }

      // -----------------------------------
      // API response
      // -----------------------------------

      result = {
        item: item.toJSON(),
        shifted,
        overflow,
        continuedTo,
        pulledBack,
        isEdit
      };

    });

    return result;

  } catch (error: any) {
    console.error(
      "COMPLETE API ERROR:",
      error.message
    );

    throw error;

  } finally {
    await session.endSession();
  }
}

