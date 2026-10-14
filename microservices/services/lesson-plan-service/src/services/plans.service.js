
import {
  Plan,
  PlanItem,
  PLAN_STATUS,
  LESSON_STATUS,
  emptyDetails
} from "../models/plans.model.js";

import { getSchoolData } from "./school-client.js";

import {
  byDateAndPeriod,
  flatTopics,
  generatePlanItems
} from "./plans.engine.js";

import { Syllabus } from "../models/syllabus.model.js";

import { addDays, todayISO } from "../utils/dates.js";

import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "../utils/response.js";

const LIVE = (status) =>
  status !== LESSON_STATUS.RESCHEDULED &&
  status !== LESSON_STATUS.CANCELLED;

const MAX_PLAN_DAYS = 200;

// -----------------------------------------
// School data from Auth Service
// -----------------------------------------

export async function loadSchool(schoolId) {
  const data = await getSchoolData(schoolId);

  const {
    classes = [],
    sections = [],
    subjects = [],
    staff = [],
    timetable = [],
    holidays = [],
    exams = [],
    templates = [],
    settings = {}
  } = data;

  const map = (list) =>
    new Map(list.map((item) => [item.id, item]));

  const cls = map(classes);
  const sec = map(sections);
  const sub = map(subjects);
  const stf = map(staff);

  const bell = settings.bellSchedule || [];
  const periods = map(bell);

  return {
    settings,
    timetable,
    holidays,
    exams,
    templates,

    periodIds: bell
      .filter((item) => item.type === "period")
      .map((item) => item.id),

    section: (id) => sec.get(id),

    sectionLabel: (id) => {
      const section = sec.get(id);

      return section
        ? `${cls.get(section.classId)?.name}-${section.name}`
        : "";
    },

    subjectName: (id) => sub.get(id)?.name,

    staff: (id) => stf.get(id),

    period: (id) => periods.get(id)
  };
}

// -----------------------------------------
// Enrich lesson item with school details
// -----------------------------------------

export function enrich(item, sch, planStatus) {
  const it =
    typeof item.toJSON === "function"
      ? item.toJSON()
      : item;

  const period = sch.period(it.periodId);

  return {
    ...it,

    classLabel: sch.sectionLabel(it.sectionId),

    subjectName: sch.subjectName(it.subjectId),

    teacherName: sch.staff(it.teacherId)?.name,

    periodLabel: period?.label,

    start: period?.start,

    end: period?.end,

    planStatus
  };
}

const missingDetails = (item) =>
  item.status === LESSON_STATUS.PLANNED &&
  (
    !item.details?.objectives?.length ||
    !item.details?.method
  );

// -----------------------------------------
// Plan summaries
// -----------------------------------------

async function summaries(plans, sch) {
  if (!plans.length) {
    return [];
  }

  const items = await PlanItem.find(
    {
      planId: {
        $in: plans.map((plan) => plan.id)
      }
    },
    {
      planId: 1,
      status: 1,
      "details.objectives": 1,
      "details.method": 1
    }
  ).lean();

  return plans.map((plan) => {
    const mine = items.filter(
      (item) => item.planId === plan.id
    );

    return {
      ...plan.toJSON(),

      classLabel: sch.sectionLabel(plan.sectionId),

      subjectName: sch.subjectName(plan.subjectId),

      teacherName: sch.staff(plan.teacherId)?.name,

      total: mine.filter(
        (item) =>
          item.status !== LESSON_STATUS.RESCHEDULED
      ).length,

      completed: mine.filter(
        (item) =>
          item.status === LESSON_STATUS.COMPLETED
      ).length,

      missingDetails: mine.filter(missingDetails).length
    };
  });
}

// -----------------------------------------
// Authorization
// -----------------------------------------

const isOwnerOrAdmin = (user, plan) =>
  user.role === "admin" ||
  plan.teacherId === user.id;

async function findPlan(ctx, user, id) {
  const plan = await Plan.findOne({
    _id: id,
    schoolId: ctx.schoolId
  });

  if (!plan) {
    throw notFound(
      "This plan does not exist or was deleted."
    );
  }

  if (
    user.role === "teacher" &&
    plan.teacherId !== user.id
  ) {
    throw forbidden(
      "This is another teacher's plan."
    );
  }

  return plan;
}

// -----------------------------------------
// Approval status handling
// -----------------------------------------

function backToDraftIfNeeded(plan, settings) {
  if (
    plan.status === PLAN_STATUS.APPROVED &&
    settings.approvalRequired &&
    settings.editAfterApproval === "reapprove"
  ) {
    plan.status = PLAN_STATUS.DRAFT;

    return true;
  }

  return false;
}

// -----------------------------------------
// Planning inputs
// -----------------------------------------

async function planningInputs(
  schoolId,
  { classId, sectionId, subjectId, teacherId },
  settings,
  school = null
) {
  const syllabus = await Syllabus.findOne({
    schoolId,
    classId,
    subjectId
  });

  if (!syllabus) {
    throw badRequest(
      "No syllabus found for this class and subject. Ask the admin to add it first."
    );
  }

  const sch = school || await loadSchool(schoolId);

  const slots = sch.timetable.filter(
    (slot) =>
      slot.sectionId === sectionId &&
      slot.subjectId === subjectId &&
      slot.teacherId === teacherId
  );

  if (!slots.length) {
    throw badRequest(
      "There are no timetable periods for this teacher, class and subject."
    );
  }

  const existing = await PlanItem.find({
    schoolId,
    sectionId,
    subjectId
  }).lean();

  const holidays = settings.skipHolidays
    ? sch.holidays
    : [];

  const exams = settings.skipExams
    ? sch.exams
    : [];

  return {
    syllabus: syllabus.toJSON(),

    slots,

    existing,

    plannedKeys: new Set(
      existing
        .filter((item) => LIVE(item.status))
        .map(
          (item) =>
            `${item.date}|${item.periodId}`
        )
    ),

    blockedDates: new Set([
      ...holidays.map((holiday) => holiday.date),
      ...exams.map((exam) => exam.date)
    ])
  };
}

// -----------------------------------------
// Previous lesson details
// -----------------------------------------

async function previousDetails(schoolId, topicIds) {
  const previous = await PlanItem.find({
    schoolId,

    topicId: {
      $in: topicIds
    },

    "details.objectives.0": {
      $exists: true
    }
  })
    .sort({ createdAt: -1 })
    .lean();

  const byTopic = new Map();

  previous.forEach((item) => {
    if (!byTopic.has(item.topicId)) {
      byTopic.set(item.topicId, item);
    }
  });

  return byTopic;
}

// -----------------------------------------
// Insert generated lessons
// -----------------------------------------

async function insertLessons(
  schoolId,
  plan,
  placed,
  action
) {
  const topicIds = [
    ...new Set(
      placed.map((item) => item.topic.id)
    )
  ];

  const previous = await previousDetails(
    schoolId,
    topicIds
  );

  const now = new Date();

  const items = placed.map(
    ({ date, periodId, topic }) => {
      const from = previous.get(topic.id);

      return {
        schoolId,

        planId: plan.id,

        teacherId: plan.teacherId,

        classId: plan.classId,

        sectionId: plan.sectionId,

        subjectId: plan.subjectId,

        date,

        periodId,

        topicId: topic.id,

        topicTitle: topic.title,

        chapterId: topic.chapterId,

        chapterTitle: topic.chapterTitle,

        status: LESSON_STATUS.PLANNED,

        details: from
          ? {
              ...structuredClone(from.details),
              prefilledFrom: from._id
            }
          : emptyDetails(),

        history: [
          {
            at: now,
            action
          }
        ]
      };
    }
  );

  await PlanItem.insertMany(items);

  return items.length;
}

// -----------------------------------------
// GET /plans
// -----------------------------------------

export async function listPlans(
  ctx,
  user,
  { status, teacherId }
) {
  const filter = {
    schoolId: ctx.schoolId
  };

  if (user.role === "teacher") {
    filter.teacherId = user.id;
  } else if (teacherId) {
    filter.teacherId = teacherId;
  }

  if (status) {
    filter.status = status;
  }

  const [plans, sch] = await Promise.all([
    Plan.find(filter).sort({
      startDate: -1
    }),

    loadSchool(ctx.schoolId)
  ]);

  return summaries(plans, sch);
}

// -----------------------------------------
// GET /plans/:id
// -----------------------------------------

export async function getPlan(ctx, user, id) {
  const plan = await findPlan(ctx, user, id);

  const { schoolId } = ctx;

  const [sch, items, syllabus] =
    await Promise.all([
      loadSchool(schoolId),

      PlanItem.find({
        planId: id
      }),

      Syllabus.findOne({
        schoolId,
        classId: plan.classId,
        subjectId: plan.subjectId
      })
    ]);

  const slots = sch.timetable.filter(
    (slot) =>
      slot.sectionId === plan.sectionId &&
      slot.subjectId !== plan.subjectId
  );

  const holidays = sch.holidays.filter(
    (holiday) =>
      holiday.date >= plan.startDate &&
      holiday.date <= plan.endDate
  );

  const exams = sch.exams.filter(
    (exam) =>
      exam.date >= plan.startDate &&
      exam.date <= plan.endDate
  );

  const templates = [...sch.templates].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0)
  );

  const [summary] = await summaries(
    [plan],
    sch
  );

  const template =
    templates.find(
      (item) => item.id === plan.templateId
    ) ||
    templates.find(
      (item) => item.isDefault
    ) ||
    templates[0];

  return {
    plan: {
      ...summary,

      reviews: (plan.reviews || []).map(
        (review) => {
          const r =
            typeof review.toJSON === "function"
              ? review.toJSON()
              : review;

          return {
            ...r,

            byName: sch.staff(r.by)?.name,

            byRole: sch.staff(r.by)?.role
          };
        }
      )
    },

    items: items
      .map((item) =>
        enrich(item, sch, plan.status)
      )
      .sort(
        byDateAndPeriod(sch.periodIds)
      ),

    otherSlots: slots.map((slot) => ({
      ...slot,

      subjectName: sch.subjectName(
        slot.subjectId
      ),

      teacherName: sch.staff(
        slot.teacherId
      )?.name
    })),

    template: template || null,

    holidays,

    exams,

    topics: syllabus
      ? flatTopics(syllabus.toJSON())
      : []
  };
}

// -----------------------------------------
// Create plan
// -----------------------------------------

export async function createPlan(
  schoolId,
  input,
  status = PLAN_STATUS.DRAFT
) {
  const {
    teacherId,
    classId,
    sectionId,
    subjectId,
    startDate,
    endDate,
    templateId
  } = input;

  const sch = await loadSchool(schoolId);

  const settings = sch.settings;

  const section = sch.section(sectionId);

  if (
    !section ||
    section.classId !== classId
  ) {
    throw badRequest(
      "That section is not part of this class."
    );
  }

  if (!sch.staff(teacherId)) {
    throw badRequest(
      "Teacher not found."
    );
  }

  if (
    addDays(startDate, MAX_PLAN_DAYS) <
    endDate
  ) {
    throw badRequest(
      `A plan can cover at most ${MAX_PLAN_DAYS} days.`
    );
  }

  if (
    templateId &&
    !sch.templates.some(
      (template) =>
        template.id === templateId
    )
  ) {
    throw badRequest(
      "Template not found."
    );
  }

  const inp = await planningInputs(
    schoolId,
    input,
    settings,
    sch
  );

  const {
    placed,
    unscheduled,
    skippedDays
  } = generatePlanItems({
    ...inp,

    existingItems: inp.existing,

    startDate,

    endDate,

    periodIds: sch.periodIds
  });

  if (!placed.length) {
    throw badRequest(
      "Nothing to plan: all periods in these dates are already planned or are holidays."
    );
  }

  const defaultTemplate = sch.templates.find(
    (template) => template.isDefault
  );

  const plan = await Plan.create({
    schoolId,

    teacherId,

    classId,

    sectionId,

    subjectId,

    startDate,

    endDate,

    templateId:
      templateId ||
      defaultTemplate?.id,

    status
  });

  const placedCount = await insertLessons(
    schoolId,
    plan,
    placed,
    "created"
  );

  const [summary] = await summaries(
    [plan],
    sch
  );

  return {
    plan: summary,

    unscheduled,

    skippedDays,

    placedCount
  };
}

// -----------------------------------------
// POST /plans/generate
// -----------------------------------------

export async function generatePlan(
  ctx,
  user,
  body
) {
  let teacherId = body.teacherId;

  if (user.role === "teacher") {
    teacherId = user.id;
  } else if (!teacherId) {
    throw badRequest(
      "Choose the teacher this plan is for."
    );
  }

  return createPlan(
    ctx.schoolId,
    {
      ...body,
      teacherId
    }
  );
}

// -----------------------------------------
// DELETE /plans/:id
// -----------------------------------------

export async function deletePlan(
  ctx,
  user,
  id
) {
  const plan = await findPlan(
    ctx,
    user,
    id
  );

  if (!isOwnerOrAdmin(user, plan)) {
    throw forbidden(
      "Only the teacher of this plan can delete it."
    );
  }

  const hasMarkedLessons =
    await PlanItem.exists({
      planId: id,

      status: {
        $ne: LESSON_STATUS.PLANNED
      }
    });

  if (hasMarkedLessons) {
    throw conflict(
      "This plan has lessons already marked. It cannot be deleted."
    );
  }

  await PlanItem.deleteMany({
    planId: id
  });

  await Plan.deleteOne({
    _id: id
  });
}

// -----------------------------------------
// POST /plans/:id/extend
// -----------------------------------------

export async function extendPlan(
  ctx,
  user,
  id,
  { endDate }
) {
  const plan = await findPlan(
    ctx,
    user,
    id
  );

  if (!isOwnerOrAdmin(user, plan)) {
    throw forbidden(
      "Only the teacher of this plan can extend it."
    );
  }

  if (
    plan.status === PLAN_STATUS.SUBMITTED
  ) {
    throw conflict(
      "This plan is waiting for approval. Extend it after it is reviewed."
    );
  }

  if (endDate <= plan.endDate) {
    throw badRequest(
      `Choose a date after the current end date (${plan.endDate}).`
    );
  }

  if (
    addDays(plan.startDate, MAX_PLAN_DAYS) <
    endDate
  ) {
    throw badRequest(
      `A plan can cover at most ${MAX_PLAN_DAYS} days.`
    );
  }

  const sch = await loadSchool(
    ctx.schoolId
  );

  const settings = sch.settings;

  const inp = await planningInputs(
    ctx.schoolId,
    plan,
    settings,
    sch
  );

  const nextDay = addDays(
    plan.endDate,
    1
  );

  const from =
    nextDay > todayISO()
      ? nextDay
      : todayISO();

  const { placed } = generatePlanItems({
    ...inp,

    existingItems: inp.existing,

    startDate: from,

    endDate,

    periodIds: sch.periodIds
  });

  if (!placed.length) {
    throw badRequest(
      "No lessons to add - the syllabus is already fully planned, or there are no free periods in these dates."
    );
  }

  const added = await insertLessons(
    ctx.schoolId,
    plan,
    placed,
    "added when plan was extended"
  );

  plan.endDate = endDate;

  const planStatusChanged =
    backToDraftIfNeeded(
      plan,
      settings
    );

  await plan.save();

  return {
    added,

    planStatusChanged,

    endDate
  };
}

// -----------------------------------------
// PATCH /plan-items/:id
// -----------------------------------------

export async function updateItem(
  ctx,
  user,
  id,
  patch
) {
  const item = await PlanItem.findOne({
    _id: id,

    schoolId: ctx.schoolId
  });

  if (!item) {
    throw notFound(
      "Lesson not found."
    );
  }

  const plan = await findPlan(
    ctx,
    user,
    item.planId
  );

  if (!isOwnerOrAdmin(user, plan)) {
    throw forbidden(
      "Only the teacher of this plan can edit its lessons."
    );
  }

  if (
    plan.status === PLAN_STATUS.SUBMITTED
  ) {
    throw conflict(
      "This plan is waiting for approval. You can edit it after it is reviewed."
    );
  }

  if (!LIVE(item.status)) {
    throw conflict(
      "This lesson was rescheduled or cancelled, so it cannot be edited."
    );
  }

  if (patch.details) {
    item.details = {
      ...(item.details || emptyDetails()),

      ...patch.details
    };
  }

  if (
    patch.topicId &&
    patch.topicId !== item.topicId
  ) {
    const syllabus = await Syllabus.findOne({
      schoolId: ctx.schoolId,

      classId: item.classId,

      subjectId: item.subjectId
    });

    const topic = syllabus &&
      flatTopics(
        syllabus.toJSON()
      ).find(
        (topic) =>
          topic.id === patch.topicId
      );

    if (!topic) {
      throw badRequest(
        "That topic is not in this syllabus."
      );
    }

    Object.assign(item, {
      topicId: topic.id,

      topicTitle: topic.title,

      chapterId: topic.chapterId,

      chapterTitle: topic.chapterTitle
    });
  }

  item.history.push({
    at: new Date(),

    action: "edited",

    by: user.id
  });

  item.markModified("details");

  await item.save();

  const sch = await loadSchool(
    ctx.schoolId
  );

  const settings = sch.settings;

  const planStatusChanged =
    backToDraftIfNeeded(
      plan,
      settings
    );

  if (planStatusChanged) {
    await plan.save();
  }

  return {
    item: enrich(
      item,
      sch,
      plan.status
    ),

    planStatusChanged
  };
}

// POST /plans/:id/submit
export async function submitPlan(ctx, user, id) {
  const plan = await findPlan(ctx, user, id);

  if (!isOwnerOrAdmin(user, plan)) {
    throw forbidden("Only the plan owner or admin can submit this plan.");
  }

  if (![PLAN_STATUS.DRAFT, PLAN_STATUS.RETURNED].includes(plan.status)) {
    throw conflict("Only draft or returned plans can be submitted.");
  }

  plan.status = PLAN_STATUS.SUBMITTED;
  plan.submittedAt = new Date();

  await plan.save();

  return plan.toJSON();
}