
import { Plan, PlanItem, LESSON_STATUS } from "../models/plans.model.js";
import { loadSchool, enrich } from "./plans.service.js";
import { Syllabus } from "../models/syllabus.model.js";

// Auth Service uses Monday = 0 and Sunday = 6.
function getWeekday(date) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function getWeekRange(date) {
  const current = new Date(`${date}T00:00:00Z`);
  const weekday = getWeekday(date);

  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - weekday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10)
  };
}

function sortByPeriod(items, sch) {
  return items.sort(
    (a, b) =>
      sch.periodIds.indexOf(a.periodId) -
      sch.periodIds.indexOf(b.periodId)
  );
}

export async function getToday(ctx, user, date) {
  const schoolId = ctx.schoolId;
  const teacherId = user.id;
  const weekday = getWeekday(date);

  // -----------------------------------------
  // 1. Load school information from Auth Service
  // -----------------------------------------

  const sch = await loadSchool(schoolId);

  // -----------------------------------------
  // 2. Check whether the date is a holiday
  // -----------------------------------------

  const holiday =
    sch.holidays.find((item) => item.date === date) || null;

  // -----------------------------------------
  // 3. Load today's and earlier lesson items
  // -----------------------------------------

  const [todayItems, earlierItems] = await Promise.all([
    PlanItem.find({
      schoolId,
      teacherId,
      date,
      status: {
        $nin: [
          LESSON_STATUS.RESCHEDULED,
          LESSON_STATUS.CANCELLED
        ]
      }
    }).lean(),

    PlanItem.find({
      schoolId,
      teacherId,
      date: { $lt: date },
      status: LESSON_STATUS.PLANNED
    }).lean()
  ]);

  // -----------------------------------------
  // 4. Find the associated lesson plans
  // -----------------------------------------

  const allItems = [...todayItems, ...earlierItems];

  const planIds = [
    ...new Set(allItems.map((item) => item.planId))
  ];

  const plans = await Plan.find({
    _id: { $in: planIds },
    schoolId,
    teacherId
  }).lean();

  const planMap = new Map(
    plans.map((plan) => [plan._id, plan])
  );

  // -----------------------------------------
  // 5. Today's lessons
  // -----------------------------------------

  const lessons = sortByPeriod(
    todayItems
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
      }),
    sch
  );

  // -----------------------------------------
  // 6. Pending marking
  // -----------------------------------------

  const pendingMarking = earlierItems
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
    });

  // -----------------------------------------
  // 7. Today's statistics
  // -----------------------------------------

  const completed = lessons.filter(
    (item) => item.status === LESSON_STATUS.COMPLETED
  ).length;

  const pending = lessons.filter(
    (item) => item.status === LESSON_STATUS.PLANNED
  ).length;

  // -----------------------------------------
  // 8. Weekly statistics
  // -----------------------------------------

  const { start: weekStart, end: weekEnd } =
    getWeekRange(date);

  const weeklyItems = await PlanItem.find({
    schoolId,
    teacherId,
    date: {
      $gte: weekStart,
      $lte: weekEnd
    },
    status: {
      $nin: [
        LESSON_STATUS.RESCHEDULED,
        LESSON_STATUS.CANCELLED
      ]
    }
  }).lean();

  const weeklyPlanIds = [
    ...new Set(weeklyItems.map((item) => item.planId))
  ];

  const weeklyPlans = await Plan.find({
    _id: { $in: weeklyPlanIds },
    schoolId,
    teacherId
  })
    .select("_id")
    .lean();

  const validWeeklyPlanIds = new Set(
    weeklyPlans.map((plan) => plan._id)
  );

  const validWeeklyItems = weeklyItems.filter(
    (item) => validWeeklyPlanIds.has(item.planId)
  );

  const week = validWeeklyItems.length;

  const weekCompleted = validWeeklyItems.filter(
    (item) => item.status === LESSON_STATUS.COMPLETED
  ).length;

  // -----------------------------------------
  // 9. Find scheduled timetable periods
  // -----------------------------------------

  const scheduledSlots = holiday
    ? []
    : sch.timetable.filter(
        (slot) =>
          String(slot.teacherId) === String(teacherId) &&
          Number(slot.weekday) === weekday
      );

  // -----------------------------------------
  // 10. Find unplanned timetable periods
  // -----------------------------------------

  const unplanned = sortByPeriod(
    scheduledSlots
      .filter(
        (slot) =>
          !todayItems.some(
            (item) =>
              item.sectionId === slot.sectionId &&
              item.periodId === slot.periodId
          )
      )
      .map((slot) => {
        const period = sch.period(slot.periodId);

        return {
          sectionId: slot.sectionId,
          subjectId: slot.subjectId,
          periodId: slot.periodId,
          classLabel: sch.sectionLabel(slot.sectionId),
          subjectName: sch.subjectName(slot.subjectId),
          label: period?.label || slot.periodId,
          start: period?.start || "",
          end: period?.end || ""
        };
      }),
    sch
  );

  // -----------------------------------------
  // 11. Find teacher's class/subject combinations
  // -----------------------------------------

  const teacherSlots = sch.timetable.filter(
    (slot) => String(slot.teacherId) === String(teacherId)
  );

  const uniqueCombinations = new Map();

  for (const slot of teacherSlots) {
    const section = sch.section(slot.sectionId);

    if (!section) continue;

    const key = `${slot.sectionId}:${slot.subjectId}`;

    if (!uniqueCombinations.has(key)) {
      uniqueCombinations.set(key, {
        sectionId: slot.sectionId,
        classId: section.classId,
        subjectId: slot.subjectId
      });
    }
  }

  // -----------------------------------------
  // 12. Calculate syllabus coverage
  // -----------------------------------------

  const coverage = [];

  let totalTopics = 0;
  let totalCompletedTopics = 0;

  for (const combination of uniqueCombinations.values()) {
    const { sectionId, classId, subjectId } = combination;

    const syllabus = await Syllabus.findOne({
      schoolId,
      classId,
      subjectId
    }).lean();

    if (!syllabus) continue;

    const topicIds = new Set(
      (syllabus.chapters || []).flatMap(
        (chapter) =>
          (chapter.topics || []).map((topic) => topic._id)
      )
    );

    const completedItems = await PlanItem.find({
      schoolId,
      teacherId,
      sectionId,
      subjectId,
      status: LESSON_STATUS.COMPLETED,
      topicId: { $in: [...topicIds] },
      date: { $lte: date }
    })
      .select("topicId")
      .lean();

    const completedTopicIds = new Set(
      completedItems.map((item) => item.topicId)
    );

    const topicCount = topicIds.size;
    const completedCount = completedTopicIds.size;

    const overall =
      topicCount > 0
        ? Math.round(
            (completedCount / topicCount) * 100
          )
        : 0;

    coverage.push({
      sectionId,
      subjectId,
      classLabel: sch.sectionLabel(sectionId),
      subjectName: sch.subjectName(subjectId),
      overall
    });

    totalTopics += topicCount;
    totalCompletedTopics += completedCount;
  }

  // -----------------------------------------
  // 13. Overall syllabus completion
  // -----------------------------------------

  const syllabusPercentage =
    totalTopics > 0
      ? Math.round(
          (totalCompletedTopics / totalTopics) * 100
        )
      : 0;

  // -----------------------------------------
  // 14. Final Today API response
  // -----------------------------------------

  return {
    date,
    holiday,
    lessons,
    unplanned,
    pendingMarking,
    coverage,
    stats: {
      today: lessons.length,
      completed,
      pending,
      week,
      weekCompleted,
      syllabus: syllabusPercentage
    }
  };
}
