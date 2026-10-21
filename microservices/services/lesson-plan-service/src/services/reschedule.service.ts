import { RequestContext, AuthUser } from "../types";

import mongoose from "mongoose";

import {
  Plan,
  PlanItem,
  PLAN_STATUS,
  LESSON_STATUS
} from "../models/plans.model";

import { loadSchool } from "./plans.service";
import { weekdayIndex, todayISO } from "../utils/dates";
import { conflict, forbidden, notFound } from "../utils/AppError";

const INACTIVE = [
  LESSON_STATUS.CANCELLED,
  LESSON_STATUS.RESCHEDULED
];

function validDate(date: any) {
  if (typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const d = new Date(`${date}T00:00:00Z`);

  return !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === date;
}

function blockedDate(school: any, date: any) {
  const holiday =
    school.settings?.skipHolidays !== false &&
    (school.holidays || []).some((h: any) => h.date === date);

  const exam =
    school.settings?.skipExams !== false &&
    (school.exams || []).some((e: any) => {
      const start = e.startDate || e.date;
      return start &&
        date >= start &&
        date <= (e.endDate || start);
    });

  return holiday || exam;
}

export async function rescheduleItem(ctx: RequestContext, user: AuthUser, id: any, body: any) {
  const { date, periodId, reason } = body;

  if (
    !validDate(date) ||
    !periodId ||
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    throw conflict("Valid date, periodId and reason are required.");
  }

  if (date < todayISO()) {
    throw conflict("Cannot reschedule to a past date.");
  }

  const school = await loadSchool(ctx.schoolId);

  if (blockedDate(school, date)) {
    throw conflict("Cannot reschedule to a holiday or exam day.");
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const item = await PlanItem.findOne({
        _id: id,
        schoolId: ctx.schoolId
      }).session(session);

      if (!item) throw notFound("Lesson not found.");

      const plan = await Plan.findOne({
        _id: item.planId,
        schoolId: ctx.schoolId
      }).session(session);

      if (!plan) throw notFound("Lesson plan not found.");

      if (
        user.role !== "teacher" ||
        item.teacherId !== user.id ||
        plan.teacherId !== user.id
      ) {
        throw forbidden("Only the assigned teacher can reschedule.");
      }

      if (
        plan.status === PLAN_STATUS.SUBMITTED ||
        (
          plan.status === PLAN_STATUS.APPROVED &&
          school.settings?.approvalRequired &&
          school.settings?.editAfterApproval === "reapprove"
        )
      ) {
        throw conflict("Plan requires approval before editing.");
      }

      if (item.status !== LESSON_STATUS.PLANNED) {
        throw conflict("Only planned lessons can be rescheduled.");
      }

      if (item.date === date && item.periodId === periodId) {
        throw conflict("Choose a different date or period.");
      }

      const slot = (school.timetable || []).find((t: any) =>
        t.teacherId === item.teacherId &&
        t.sectionId === item.sectionId &&
        t.subjectId === item.subjectId &&
        t.weekday === weekdayIndex(date) &&
        t.periodId === periodId
      );

      if (!slot) {
        throw conflict("Selected period is not in the timetable.");
      }

      const period = (school.settings?.bellSchedule || [])
        .find((p: any) => p.id === periodId && p.type === "period");

      if (!period?.start) {
        throw conflict("Period start time is missing.");
      }

      const [y, m, d] = date.split("-").map(Number);
      const [h, min] = period.start.split(":").map(Number);

      // Assumes the server timezone matches the school's timezone.
      if (Date.now() >= new Date(y, m - 1, d, h, min).getTime()) {
        throw conflict("Selected period has already started.");
      }

      const occupied = await PlanItem.findOne({
        schoolId: ctx.schoolId,
        date,
        periodId,
        status: { $nin: INACTIVE },
        $or: [
          { teacherId: item.teacherId },
          { sectionId: item.sectionId }
        ]
      }).session(session);

      if (occupied) {
        throw conflict("Selected period is already occupied.");
      }

      const now = new Date();

      const replacement = new PlanItem({
        schoolId: item.schoolId,
        planId: item.planId,
        teacherId: item.teacherId,
        classId: item.classId,
        sectionId: item.sectionId,
        subjectId: item.subjectId,
        date,
        periodId,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        chapterId: item.chapterId,
        chapterTitle: item.chapterTitle,
        details: item.details,
        continued: item.continued,
        continuationOf: item.continuationOf,
        status: LESSON_STATUS.PLANNED,
        completion: null,
        history: [{
          at: now,
          action: `rescheduled from ${item.date} (${item.periodId})`,
          reason: reason.trim(),
          by: user.id
        }]
      });

      await replacement.save({ session });

      item.status = LESSON_STATUS.RESCHEDULED;

      item.history.push({
        at: now,
        action: `rescheduled to ${date} (${periodId}); replacement ${replacement._id}`,
        reason: reason.trim(),
        by: user.id
      });

      await item.save({ session });

      if (date > plan.endDate) {
        plan.endDate = date;
        await plan.save({ session });
      }

      result = {
        original: item.toJSON(),
        replacement: replacement.toJSON(),
        reason: reason.trim()
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}
