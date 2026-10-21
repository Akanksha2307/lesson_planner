import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import {
  Plan,
  PlanItem,
  LESSON_STATUS
} from "../models/plans.model";

import { getSchoolData } from "./school-client.service";

import {
  addDays,
  todayISO,
  weekdayIndex
} from "../utils/dates";

function validateDate(date: any) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    const error: any = new Error("Valid date in YYYY-MM-DD format required");
    error.status = 400;
    throw error;
  }
}

export async function getHolidayImpact(schoolId: string, date: any) {
  validateDate(date);

  return PlanItem.countDocuments({
    schoolId,
    date,
    status: LESSON_STATUS.PLANNED
  });
}

export async function shiftLessonsForHoliday(schoolId: string, date: any) {
  if (!schoolId || typeof schoolId !== "string") {
    const error: any = new Error("Valid schoolId required");
    error.status = 400;
    throw error;
  }

  validateDate(date);

  if (date < todayISO()) {
    const error: any = new Error("Past holidays cannot reschedule lessons");
    error.status = 400;
    throw error;
  }

  const school = await getSchoolData(schoolId);

  const blockedDates = new Set([date]);

  for (const holiday of school.holidays || []) {
    if (holiday.date) {
      blockedDates.add(holiday.date);
    }
  }

  for (const exam of school.exams || []) {
    const start = exam.startDate || exam.date || exam.examDate;
    const end = exam.endDate || start;

    if (!start || !end || end < start) continue;

    let cursor = start;

    while (cursor <= end) {
      blockedDates.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }

  const periodOrder = new Map(
    (school.settings?.bellSchedule || [])
      .filter((period: any) => period.type === "period")
      .map((period: any, index: any) => [period.id, index])
  );

  const sortItems = (a: any, b: any) =>
    a.date.localeCompare(b.date) ||
    ((periodOrder.get(a.periodId) as number) ?? 999) -
    ((periodOrder.get(b.periodId) as number) ?? 999);

  const session = await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(async () => {
      const affected = await PlanItem.find({
        schoolId,
        date,
        status: LESSON_STATUS.PLANNED
      }).session(session).lean();

      if (!affected.length) {
        result = {
          affectedCount: 0,
          movedCount: 0,
          teacherIds: [],
          planIds: []
        };
        return;
      }

      const groups = new Map();

      for (const item of affected) {
        const key = [
          item.teacherId,
          item.sectionId,
          item.subjectId
        ].join("|");

        if (!groups.has(key)) {
          groups.set(key, item);
        }
      }

      const reserved = new Set();

      const teacherIds = new Set();
      const planIds = new Set();

      let movedCount = 0;

      for (const sample of groups.values()) {
        const queue = await PlanItem.find({
          schoolId,
          teacherId: sample.teacherId,
          sectionId: sample.sectionId,
          subjectId: sample.subjectId,
          date: { $gte: date },
          status: LESSON_STATUS.PLANNED
        }).session(session).lean();

        queue.sort(sortItems);

        const movableIds = new Set(
          queue.map(item => item._id)
        );

        const availableSlots = [];

        let cursor = addDays(date, 1);

        for (
          let day = 0;
          day < 365 && availableSlots.length < queue.length;
          day++
        ) {
          if (!blockedDates.has(cursor)) {
            const weekday = weekdayIndex(cursor);

            const timetableSlots = (school.timetable || [])
              .filter((slot: any) =>
                slot.teacherId === sample.teacherId &&
                slot.sectionId === sample.sectionId &&
                slot.subjectId === sample.subjectId &&
                slot.weekday === weekday
              )
              .sort((a: any, b: any) =>
                ((periodOrder.get(a.periodId) as number) ?? 999) -
                ((periodOrder.get(b.periodId) as number) ?? 999)
              );

            for (const slot of timetableSlots) {
              if (availableSlots.length >= queue.length) {
                break;
              }

              const key = `${cursor}|${slot.periodId}`;

              const sectionReservation =
                `${key}|section:${sample.sectionId}`;

              const teacherReservation =
                `${key}|teacher:${sample.teacherId}`;

              if (
                reserved.has(sectionReservation) ||
                reserved.has(teacherReservation)
              ) {
                continue;
              }

              const occupied = await PlanItem.exists({
                schoolId,
                date: cursor,
                periodId: slot.periodId,
                _id: {
                  $nin: [...movableIds]
                },
                status: {
                  $nin: [
                    LESSON_STATUS.CANCELLED,
                    LESSON_STATUS.RESCHEDULED
                  ]
                },
                $or: [
                  { sectionId: sample.sectionId },
                  { teacherId: sample.teacherId }
                ]
              }).session(session);

              if (!occupied) {
                availableSlots.push({
                  date: cursor,
                  periodId: slot.periodId
                });

                reserved.add(sectionReservation);
                reserved.add(teacherReservation);
              }
            }
          }

          cursor = addDays(cursor, 1);
        }

        if (availableSlots.length < queue.length) {
          const error: any = new Error(
            "Not enough free timetable periods within 365 days"
          );

          error.status = 409;
          throw error;
        }

        for (let i = 0; i < queue.length; i++) {
          const original = queue[i];
          const destination = availableSlots[i];

          const newId = `item_${randomUUID()}`;

          const updateResult = await PlanItem.updateOne(
            {
              _id: original._id,
              schoolId,
              status: LESSON_STATUS.PLANNED
            },
            {
              $set: {
                status: LESSON_STATUS.RESCHEDULED
              },
              $push: {
                history: {
                  at: new Date(),
                  action: "rescheduled",
                  reason: `Unexpected holiday on ${date}`,
                  by: "system"
                }
              }
            },
            { session }
          );

          if (updateResult.modifiedCount !== 1) {
            const error: any = new Error(
              "Lesson was already modified during rescheduling"
            );

            error.status = 409;
            throw error;
          }

          const {
            _id,
            __v,
            createdAt,
            updatedAt,
            ...lessonData
          } = original;

          const replacement = {
            ...lessonData,
            _id: newId,
            date: destination.date,
            periodId: destination.periodId,
            status: LESSON_STATUS.PLANNED,
            completion: null,
            history: [
              {
                at: new Date(),
                action: "rescheduled",
                reason:
                  `Moved from ${original.date} because of holiday`,
                by: "system"
              }
            ]
          };

          await PlanItem.create(
            [replacement],
            { session }
          );

          await Plan.updateOne(
            {
              _id: original.planId,
              schoolId,
              endDate: { $lt: destination.date }
            },
            {
              $set: {
                endDate: destination.date
              }
            },
            { session }
          );

          teacherIds.add(original.teacherId);
          planIds.add(original.planId);

          movedCount++;
        }
      }

      result = {
        affectedCount: affected.length,
        movedCount,
        teacherIds: [...teacherIds],
        planIds: [...planIds]
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}
