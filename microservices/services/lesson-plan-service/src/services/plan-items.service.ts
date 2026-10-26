import mongoose from "mongoose";

import { PLAN_STATUS, LESSON_STATUS, Plan, PlanItem } from "../models/plans.model";
import { conflict, forbidden, notFound } from "../utils/AppError";
import { loadSchool } from "./plans.service";
import { continueCore } from "./completion-scheduling.service";
import { weekdayIndex, todayISO } from "../utils/dates";
import { AuthUser, RequestContext } from "../types";
import {
  AddPeriodsBody,
  HistoryQuery,
  SwapBody,
  TargetBody
} from "../validations/plan-items.validation";

const INACTIVE = [
  LESSON_STATUS.CANCELLED,
  LESSON_STATUS.RESCHEDULED
];

function ensureEditable(plan: any, school: any) {
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

// The teacher arranges their own lessons. An admin may also move / swap lessons, but only
// while the plan is a draft or was sent back (never while it waits for or after approval).
async function arrangeableItem(ctx: RequestContext, user: AuthUser, id: string, session: any) {
  if (user.role !== "admin") return ownedItem(ctx, user, id, session);

  const item = await PlanItem.findOne({ _id: id, schoolId: ctx.schoolId }).session(session);
  if (!item) throw notFound("Lesson not found.");
  const plan = await Plan.findOne({ _id: item.planId, schoolId: ctx.schoolId }).session(session);
  if (!plan) throw notFound("Plan not found.");
  if (![PLAN_STATUS.DRAFT, PLAN_STATUS.RETURNED].includes(plan.status as string)) {
    throw conflict("The admin can only rearrange a plan while it is a draft or sent back.");
  }
  return { item, plan };
}

async function ownedItem(ctx: RequestContext, user: AuthUser, id: string, session: any) {
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

function validateSlot(school: any, item: any, date: string, periodId: string) {
  if (date < todayISO()) {
    throw conflict("Cannot select a past date.");
  }

  const holiday =
    school.settings?.skipHolidays !== false &&
    (school.holidays || []).some((h: any) => h.date === date);

  const exam =
    school.settings?.skipExams !== false &&
    (school.exams || []).some((e: any) => {
      const start = e.startDate || e.date;
      return start && date >= start &&
        date <= (e.endDate || start);
    });

  if (holiday || exam) {
    throw conflict("Holiday or examination date.");
  }

  const valid = (school.timetable || []).some((t: any) =>
    t.teacherId === item.teacherId &&
    t.sectionId === item.sectionId &&
    t.subjectId === item.subjectId &&
    t.weekday === weekdayIndex(date) &&
    t.periodId === periodId
  );

  if (!valid) {
    throw conflict("Period does not match the timetable.");
  }

  const period = (school.settings?.bellSchedule || [])
    .find((p: any) => p.id === periodId && p.type === "period");

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

async function ensureFree(ctx: RequestContext, item: any, date: string, periodId: string, session: any, excluded: any[] = []) {
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

async function transaction<T>(work: (session: any) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();

  try {
    let result!: T;

    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
}

function record(item: any, action: string, userId: string, reason: string = "") {
  item.history.push({
    at: new Date(),
    action,
    reason,
    by: userId
  });
}

function copyContent(item: any) {
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

export async function cancelLesson(
  ctx: RequestContext,
  user: AuthUser,
  id: string,
  reason: string
) {
  const school = await loadSchool(ctx.schoolId);

  return transaction(async (session: any) => {
    const { item, plan } = await ownedItem(ctx, user, id, session);

    ensureEditable(plan, school);

    if (item.status !== LESSON_STATUS.PLANNED) {
      throw conflict("Only planned lessons can be cancelled.");
    }

    item.status = LESSON_STATUS.CANCELLED;
    record(item, "lesson cancelled", user.id, reason);

    await item.save({ session });
    return item.toJSON();
  });
}

// --------------------------------------
// 2. CONTINUE UNFINISHED LESSON
// --------------------------------------

export async function continueLesson(
  ctx: RequestContext,
  user: AuthUser,
  id: string,
  target: TargetBody
) {
  return transaction(async (session: any) => {
    const { item } = await ownedItem(ctx, user, id, session);

    if (
      ![
        LESSON_STATUS.PARTIAL,
        LESSON_STATUS.NOT_DONE
      ].includes(item.status)
    ) {
      throw conflict("Only unfinished lessons can continue.");
    }

    const school = await loadSchool(ctx.schoolId);
    validateSlot(school, item, target.date, target.periodId);

    const outcome = await continueCore(
      ctx,
      item,
      {
        date: target.date,
        periodId: target.periodId
      },
      session
    );

    return {
      continuedTo: {
        date: target.date,
        periodId: target.periodId
      },
      shifted: outcome.changed
    };
  });
}

// --------------------------------------
// 3. MOVE LESSON
// --------------------------------------

export async function moveLesson(
  ctx: RequestContext,
  user: AuthUser,
  id: string,
  target: TargetBody
) {
  const school = await loadSchool(ctx.schoolId);

  return transaction(async (session: any) => {
    const { item, plan } = await arrangeableItem(ctx, user, id, session);

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
      ctx, item, target.date, target.periodId,
      session, [item._id]
    );

    const oldDate = item.date;
    const oldPeriod = item.periodId;

    item.date = target.date;
    item.periodId = target.periodId;

    record(
      item,
      `moved from ${oldDate} (${oldPeriod}) to ${target.date} (${target.periodId})`,
      user.id,
      target.reason
    );

    await item.save({ session });

    if (target.date > plan.endDate) {
      plan.endDate = target.date;
      await plan.save({ session });
    }

    return item.toJSON();
  });
}

// --------------------------------------
// 4. SWAP TWO LESSONS
// --------------------------------------

export async function swapLessons(
  ctx: RequestContext,
  user: AuthUser,
  body: SwapBody
) {
  if (body.firstItemId === body.secondItemId) {
    throw conflict("Choose two different lessons.");
  }

  const school = await loadSchool(ctx.schoolId);

  return transaction(async (session: any) => {
    const first = await arrangeableItem(ctx, user, body.firstItemId, session);
    const second = await arrangeableItem(ctx, user, body.secondItemId, session);

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

    await ensureFree(ctx, a, b.date, b.periodId, session, [a._id, b._id]);
    await ensureFree(ctx, b, a.date, a.periodId, session, [a._id, b._id]);

    const original = {
      date: a.date,
      periodId: a.periodId
    };

    a.date = b.date;
    a.periodId = b.periodId;

    b.date = original.date;
    b.periodId = original.periodId;

    record(a, `swapped with ${b._id}`, user.id);
    record(b, `swapped with ${a._id}`, user.id);

    await a.save({ session });
    await b.save({ session });

    for (const plan of [first.plan, second.plan]) {
      const latest = [
        plan.endDate,
        a.date,
        b.date
      ].sort().at(-1) as string;

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
}

// --------------------------------------
// 5. ADD EXTRA PERIODS
// --------------------------------------

export async function addPeriods(
  ctx: RequestContext,
  user: AuthUser,
  id: string,
  body: AddPeriodsBody
) {
  const school = await loadSchool(ctx.schoolId);

  return transaction(async (session: any) => {
    const { item, plan } = await ownedItem(ctx, user, id, session);

    ensureEditable(plan, school);

    if (item.status !== LESSON_STATUS.PLANNED) {
      throw conflict("Only planned lessons support extra periods.");
    }

    const created: any[] = [];
    let cursor = new Date(`${item.date}T00:00:00Z`);

    for (let day = 0; day < 120 && created.length < body.count; day++) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const date = cursor.toISOString().slice(0, 10);

      const slots = (school.timetable || []).filter((t: any) =>
        t.teacherId === item.teacherId &&
        t.sectionId === item.sectionId &&
        t.subjectId === item.subjectId &&
        t.weekday === weekdayIndex(date)
      );

      for (const slot of slots) {
        if (created.length >= body.count) break;

        try {
          validateSlot(school, item, date, slot.periodId);

          await ensureFree(ctx, item, date, slot.periodId, session);
        } catch (error: any) {
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
            by: user.id
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
}

// --------------------------------------
// 6. LESSON HISTORY
// --------------------------------------

export async function listHistory(
  ctx: RequestContext,
  user: AuthUser,
  filters: HistoryQuery
) {
  const { from, to, teacherId, sectionId, subjectId, status } = filters;

  const query: any = {
    schoolId: ctx.schoolId
  };

  if (user.role === "teacher") {
    query.teacherId = user.id;
  } else if (teacherId) {
    query.teacherId = teacherId;
  }

  if (sectionId) query.sectionId = sectionId;
  if (subjectId) query.subjectId = subjectId;
  if (status) query.status = status;

  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const items = await PlanItem.find(query)
    .sort({ date: -1, periodId: 1 })
    .limit(500)
    .lean();

  return {
    total: items.length,
    items
  };
}