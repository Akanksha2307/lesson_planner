
import { Plan, PlanItem, LESSON_STATUS } from "../models/plans.model.js";
import { loadSchool, enrich } from "./plans.service.js";

export async function getCalendar(ctx, user, filters) {
  const { from, to, sectionId, subjectId } = filters;

  const schoolId = ctx.schoolId;
  const sch = await loadSchool(schoolId);

  // Build the MongoDB query.
  const query = {
    schoolId,
    date: {
      $gte: from,
      $lte: to
    },
    status: {
      $ne: LESSON_STATUS.RESCHEDULED
    }
  };

  // Teachers can only see their own lessons.
  // Administrators, HODs and principals can see
  // lessons across the school.
  if (user.role === "teacher") {
    query.teacherId = user.id;
  }

  // Optional filters
  if (sectionId) {
    query.sectionId = sectionId;
  }

  if (subjectId) {
    query.subjectId = subjectId;
  }

  // Retrieve lesson items.
  const lessonItems = await PlanItem.find(query).lean();

  // Retrieve only valid parent plans.
  const planIds = [
    ...new Set(lessonItems.map((item) => item.planId))
  ];

  const plans = await Plan.find({
    _id: { $in: planIds },
    schoolId
  }).lean();

  const planMap = new Map(
    plans.map((plan) => [plan._id, plan])
  );

  // Add names, period details and plan status.
  const items = lessonItems
    .filter((item) => planMap.has(item.planId))
    .map((item) => {
      const enriched = enrich(
        item,
        sch,
        planMap.get(item.planId).status
      );

      return {
        ...enriched,
        id: enriched.id || item._id
      };
    })
    .sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return (
        sch.periodIds.indexOf(a.periodId) -
        sch.periodIds.indexOf(b.periodId)
      );
    });

  // Holidays within the requested date range.
  const holidays = sch.holidays.filter(
    (holiday) =>
      holiday.date >= from &&
      holiday.date <= to
  );

  // Exams within the requested date range.
  const exams = sch.exams.filter(
    (exam) =>
      exam.date >= from &&
      exam.date <= to
  );

  return {
    items,
    holidays,
    exams
  };
}
