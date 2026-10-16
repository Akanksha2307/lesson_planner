import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { allow } from "../middleware/auth.js";
import { ok, conflict, forbidden, notFound } from "../utils/response.js";
import {
  Plan,
  PlanItem,
  PLAN_STATUS,
  LESSON_STATUS
} from "../models/plans.model.js";

import { loadSchool } from "../services/plans.service.js";
import { continueCore } from "../services/completion-scheduling.service.js";
import { weekdayIndex, todayISO } from "../utils/dates.js";
import { coverageReport, teacherReport } from "../services/reports.service.js";

const router = Router();

const INACTIVE = [
  LESSON_STATUS.CANCELLED,
  LESSON_STATUS.RESCHEDULED
];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  value => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === value;
  },
  "Invalid date"
);

const targetSchema = z.object({
  date: dateSchema,
  periodId: z.string().min(1),
  reason: z.string().optional()
});

const reasonSchema = z.object({
  reason: z.string().trim().min(1)
});

const swapSchema = z.object({
  firstItemId: z.string().min(1),
  secondItemId: z.string().min(1)
});

const addPeriodsSchema = z.object({
  count: z.number().int().min(1).max(10),
  reason: z.string().optional()
});

function ensureEditable(plan, school) {
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
}

async function ownedItem(ctx, user, id, session) {
  const item = await PlanItem.findOne({
    _id: id,
    schoolId: ctx.schoolId
  }).session(session);

  if (!item) throw notFound("Lesson not found.");

  const plan = await Plan.findOne({
    _id: item.planId,
    schoolId: ctx.schoolId
  }).session(session);

  if (!plan) throw notFound("Plan not found.");

  if (
    user.role !== "teacher" ||
    item.teacherId !== user.id ||
    plan.teacherId !== user.id
  ) {
    throw forbidden("Not authorized for this lesson.");
  }

  return { item, plan };
}

function validateSlot(school, item, date, periodId) {
  if (date < todayISO()) {
    throw conflict("Cannot select a past date.");
  }

  const holiday =
    school.settings?.skipHolidays !== false &&
    (school.holidays || []).some(h => h.date === date);

  const exam =
    school.settings?.skipExams !== false &&
    (school.exams || []).some(e => {
      const start = e.startDate || e.date;
      return start && date >= start &&
        date <= (e.endDate || start);
    });

  if (holiday || exam) {
    throw conflict("Holiday or examination date.");
  }

  const valid = (school.timetable || []).some(t =>
    t.teacherId === item.teacherId &&
    t.sectionId === item.sectionId &&
    t.subjectId === item.subjectId &&
    t.weekday === ((weekdayIndex(date) + 1) % 7) &&
    t.periodId === periodId
  );

  if (!valid) {
    throw conflict("Period does not match the timetable.");
  }

  const period = (school.settings?.bellSchedule || [])
    .find(p => p.id === periodId && p.type === "period");

  if (!period?.start) {
    throw conflict("Period start time not configured.");
  }

  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = period.start.split(":").map(Number);

  // Assumes server timezone matches school timezone.
  if (Date.now() >= new Date(y, m - 1, d, h, min).getTime()) {
    throw conflict("The selected period has already started.");
  }
}

async function ensureFree(ctx, item, date, periodId, session, excluded = []) {
  const occupied = await PlanItem.findOne({
    schoolId: ctx.schoolId,
    date,
    periodId,
    _id: { $nin: excluded },
    status: { $nin: INACTIVE },
    $or: [
      { teacherId: item.teacherId },
      { sectionId: item.sectionId }
    ]
  }).session(session);

  if (occupied) throw conflict("Period is already occupied.");
}

async function transaction(work) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
}

function record(item, action, userId, reason = "") {
  item.history.push({
    at: new Date(),
    action,
    reason,
    by: userId
  });
}

function copyContent(item) {
  return {
    schoolId: item.schoolId,
    planId: item.planId,
    teacherId: item.teacherId,
    classId: item.classId,
    sectionId: item.sectionId,
    subjectId: item.subjectId,
    topicId: item.topicId,
    topicTitle: item.topicTitle,
    chapterId: item.chapterId,
    chapterTitle: item.chapterTitle,
    details: item.details,
    continued: item.continued,
    continuationOf: item.continuationOf
  };
}

// --------------------------------------
// 1. CANCEL LESSON
// --------------------------------------

router.post(
  "/plan-items/:id/cancel",
  allow("teacher"),
  async (req, res) => {
    const { reason } = reasonSchema.parse(req.body);
    const school = await loadSchool(req.ctx.schoolId);

    const result = await transaction(async session => {
      const { item, plan } = await ownedItem(
        req.ctx, req.user, req.params.id, session
      );

      ensureEditable(plan, school);

      if (item.status !== LESSON_STATUS.PLANNED) {
        throw conflict("Only planned lessons can be cancelled.");
      }

      item.status = LESSON_STATUS.CANCELLED;
      record(item, "lesson cancelled", req.user.id, reason);

      await item.save({ session });
      return item.toJSON();
    });

    ok(res, result, "Lesson cancelled");
  }
);

// --------------------------------------
// 2. CONTINUE UNFINISHED LESSON
// --------------------------------------

router.post(
  "/plan-items/:id/continue",
  allow("teacher"),
  async (req, res) => {
    const target = targetSchema.parse(req.body);

    const result = await transaction(async session => {
      const { item } = await ownedItem(
        req.ctx, req.user, req.params.id, session
      );

      if (
        ![
          LESSON_STATUS.PARTIAL,
          LESSON_STATUS.NOT_DONE
        ].includes(item.status)
      ) {
        throw conflict("Only unfinished lessons can continue.");
      }

      const school = await loadSchool(req.ctx.schoolId);
      validateSlot(school, item, target.date, target.periodId);

      let outcome;
try {
  outcome = await continueCore(
    req.ctx,
    item,
    {
      date: target.date,
      periodId: target.periodId
    },
    session
  );
} catch (error) {
  
  throw error;
}

      return {
        continuedTo: {
          date: target.date,
          periodId: target.periodId
        },
        shifted: outcome.changed
      };
    });

    ok(res, result, "Lesson continued");
  }
);

// --------------------------------------
// 3. MOVE LESSON
// --------------------------------------

router.post(
  "/plan-items/:id/move",
  allow("teacher"),
  async (req, res) => {
    const target = targetSchema.parse(req.body);
    const school = await loadSchool(req.ctx.schoolId);

    const result = await transaction(async session => {
      const { item, plan } = await ownedItem(
        req.ctx, req.user, req.params.id, session
      );

      ensureEditable(plan, school);

      if (item.status !== LESSON_STATUS.PLANNED) {
        throw conflict("Only planned lessons can be moved.");
      }

      validateSlot(school, item, target.date, target.periodId);

      if (
        item.date === target.date &&
        item.periodId === target.periodId
      ) {
        throw conflict("Select a different period.");
      }

      await ensureFree(
        req.ctx, item, target.date, target.periodId,
        session, [item._id]
      );

      const oldDate = item.date;
      const oldPeriod = item.periodId;

      item.date = target.date;
      item.periodId = target.periodId;

      record(
        item,
        `moved from ${oldDate} (${oldPeriod}) to ${target.date} (${target.periodId})`,
        req.user.id,
        target.reason
      );

      await item.save({ session });

      if (target.date > plan.endDate) {
        plan.endDate = target.date;
        await plan.save({ session });
      }

      return item.toJSON();
    });

    ok(res, result, "Lesson moved");
  }
);

// --------------------------------------
// 4. SWAP TWO LESSONS
// --------------------------------------

router.post(
  "/plan-items/swap",
  allow("teacher"),
  async (req, res) => {
    const body = swapSchema.parse(req.body);

    if (body.firstItemId === body.secondItemId) {
      throw conflict("Choose two different lessons.");
    }

    const school = await loadSchool(req.ctx.schoolId);

    const result = await transaction(async session => {
      const first = await ownedItem(
        req.ctx, req.user, body.firstItemId, session
      );

      const second = await ownedItem(
        req.ctx, req.user, body.secondItemId, session
      );

      ensureEditable(first.plan, school);
      ensureEditable(second.plan, school);

      const a = first.item;
      const b = second.item;

      if (
        a.status !== LESSON_STATUS.PLANNED ||
        b.status !== LESSON_STATUS.PLANNED
      ) {
        throw conflict("Both lessons must be planned.");
      }

      if (
        a.sectionId !== b.sectionId ||
        a.subjectId !== b.subjectId ||
        a.teacherId !== b.teacherId
      ) {
        throw conflict(
          "Swap requires the same teacher, section and subject."
        );
      }

      validateSlot(school, a, b.date, b.periodId);
      validateSlot(school, b, a.date, a.periodId);

      await ensureFree(
        req.ctx, a, b.date, b.periodId,
        session, [a._id, b._id]
      );

      await ensureFree(
        req.ctx, b, a.date, a.periodId,
        session, [a._id, b._id]
      );

      const original = {
        date: a.date,
        periodId: a.periodId
      };

      a.date = b.date;
      a.periodId = b.periodId;

      b.date = original.date;
      b.periodId = original.periodId;

      record(a, `swapped with ${b._id}`, req.user.id);
      record(b, `swapped with ${a._id}`, req.user.id);

      await a.save({ session });
      await b.save({ session });

      for (const plan of [first.plan, second.plan]) {
        const latest = [
          plan.endDate,
          a.date,
          b.date
        ].sort().at(-1);

        if (latest > plan.endDate) {
          plan.endDate = latest;
          await plan.save({ session });
        }
      }

      return {
        first: a.toJSON(),
        second: b.toJSON()
      };
    });

    ok(res, result, "Lessons swapped");
  }
);

// --------------------------------------
// 5. ADD EXTRA PERIODS
// --------------------------------------

router.post(
  "/plan-items/:id/add-periods",
  allow("teacher"),
  async (req, res) => {
    const body = addPeriodsSchema.parse(req.body);
    const school = await loadSchool(req.ctx.schoolId);

    const result = await transaction(async session => {
      const { item, plan } = await ownedItem(
        req.ctx, req.user, req.params.id, session
      );

      ensureEditable(plan, school);

      if (item.status !== LESSON_STATUS.PLANNED) {
        throw conflict("Only planned lessons support extra periods.");
      }

      const created = [];
      let cursor = new Date(`${item.date}T00:00:00Z`);

      for (let day = 0; day < 120 && created.length < body.count; day++) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        const date = cursor.toISOString().slice(0, 10);

        const slots = (school.timetable || []).filter(t =>
          t.teacherId === item.teacherId &&
          t.sectionId === item.sectionId &&
          t.subjectId === item.subjectId &&
          t.weekday === ((weekdayIndex(date) + 1) % 7)
        );

        for (const slot of slots) {
          if (created.length >= body.count) break;

          try {
            validateSlot(school, item, date, slot.periodId);

            await ensureFree(
              req.ctx, item, date, slot.periodId, session
            );
          } catch (error) {
            // Skip invalid or occupied timetable slots.
            if (
              !error.message.includes("Period") &&
              !error.message.includes("period") &&
              !error.message.includes("Holiday") &&
              !error.message.includes("examination")
            ) {
              throw error;
            }
            continue;
          }

          const extra = new PlanItem({
            ...copyContent(item),
            date,
            periodId: slot.periodId,
            status: LESSON_STATUS.PLANNED,
            continued: true,
            continuationOf: String(item._id),
            completion: null,
            history: [{
              at: new Date(),
              action: "extra period added",
              reason: body.reason || "",
              by: req.user.id
            }]
          });

          await extra.save({ session });
          created.push(extra.toJSON());

          if (date > plan.endDate) {
            plan.endDate = date;
          }
        }
      }

      if (created.length !== body.count) {
        throw conflict(
          "Not enough available periods within 120 days."
        );
      }

      if (plan.isModified("endDate")) {
        await plan.save({ session });
      }

      return {
        count: created.length,
        items: created
      };
    });

    ok(res, result, "Extra periods added");
  }
);

// --------------------------------------
// 6. LESSON HISTORY
// --------------------------------------

router.get(
  "/history",
  allow("teacher", "hod", "principal", "admin"),
  async (req, res) => {
    const {
      from,
      to,
      teacherId,
      sectionId,
      subjectId,
      status
    } = req.query;

    const query = {
      schoolId: req.ctx.schoolId
    };

    if (req.user.role === "teacher") {
      query.teacherId = req.user.id;
    } else if (teacherId) {
      query.teacherId = teacherId;
    }

    if (sectionId) query.sectionId = sectionId;
    if (subjectId) query.subjectId = subjectId;
    if (status) query.status = status;

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = dateSchema.parse(from);
      if (to) query.date.$lte = dateSchema.parse(to);
    }

    const items = await PlanItem.find(query)
      .sort({ date: -1, periodId: 1 })
      .limit(500)
      .lean();

    ok(res, {
      total: items.length,
      items
    }, "History loaded");
  }
);

// --------------------------------------
// 7. SYLLABUS COVERAGE REPORT
// --------------------------------------

router.get(
  "/reports/coverage",
  allow("teacher", "hod", "principal", "admin"),
  async (req, res) => {
    const rows = await coverageReport(req.ctx.schoolId, req.user, {
      sectionId: req.query.sectionId,
      subjectId: req.query.subjectId
    });
    ok(res, rows, "Coverage report loaded");
  }
);

// --------------------------------------
// 8. TEACHER SUMMARY REPORT
// --------------------------------------

router.get(
  "/reports/teachers",
  allow("teacher", "hod", "principal", "admin"),
  async (req, res) => {
    ok(res, await teacherReport(req.ctx.schoolId, req.user), "Teacher report loaded");
  }
);

export default router;