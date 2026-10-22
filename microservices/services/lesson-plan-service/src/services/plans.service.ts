import { RequestContext, AuthUser } from "../types";
import { notify } from "./notification-client.service";

import {
  Plan,
  PlanItem,
  PLAN_STATUS,
  LESSON_STATUS,
  emptyDetails
} from "../models/plans.model";

import { getSchoolData } from "./school-client.service";

import {
  byDateAndPeriod,
  flatTopics,
  generatePlanItems
} from "./plans.engine";

import { Syllabus } from "../models/syllabus.model";

import { addDays, todayISO } from "../utils/dates";

import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "../utils/AppError";

const LIVE = (status: any) =>
  status !== LESSON_STATUS.RESCHEDULED &&
  status !== LESSON_STATUS.CANCELLED;

const MAX_PLAN_DAYS = 200;

// -----------------------------------------
// School data from Auth Service
// -----------------------------------------

export async function loadSchool(schoolId: string) {
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

  const map = (list: any[]): Map<string, any> =>
    new Map(list.map((item: any) => [item.id, item]));

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
      .filter((item: any) => item.type === "period")
      .map((item: any) => item.id),

    section: (id: any) => sec.get(id),

    sectionLabel: (id: any) => {
      const section = sec.get(id);

      return section
        ? `${cls.get(section.classId)?.name}-${section.name}`
        : "";
    },

    subjectName: (id: any) => sub.get(id)?.name,

    staff: (id: any) => stf.get(id),

    period: (id: any) => periods.get(id)
  };
}

// -----------------------------------------
// Enrich lesson item with school details
// -----------------------------------------

export function enrich(item: any, sch: any, planStatus: any) {
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

const missingDetails = (item: any) =>
  item.status === LESSON_STATUS.PLANNED &&
  (
    !item.details?.objectives?.length ||
    !item.details?.method
  );

// -----------------------------------------
// Plan summaries
// -----------------------------------------

async function summaries(plans: any, sch: any) {
  if (!plans.length) {
    return [];
  }

  const items = await PlanItem.find(
    {
      planId: {
        $in: plans.map((plan: any) => plan.id)
      }
    },
    {
      planId: 1,
      status: 1,
      "details.objectives": 1,
      "details.method": 1
    }
  ).lean();

  return plans.map((plan: any) => {
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

const isOwnerOrAdmin = (user: AuthUser, plan: any) =>
  user.role === "admin" ||
  plan.teacherId === user.id;

async function findPlan(ctx: RequestContext, user: AuthUser, id: any) {
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

function backToDraftIfNeeded(plan: any, settings: any) {
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
  schoolId: string,
  { classId, sectionId, subjectId, teacherId }: { classId: string; sectionId: string; subjectId: string; teacherId: string },
  settings: any,
  school: any = null
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
    (slot: any) =>
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
      ...holidays.map((holiday: any) => holiday.date),
      ...exams.map((exam: any) => exam.date)
    ])
  };
}

// -----------------------------------------
// Previous lesson details
// -----------------------------------------

async function previousDetails(schoolId: string, topicIds: any) {
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
  schoolId: string,
  plan: any,
  placed: any,
  action: any
) {
  const topicIds = [
    ...new Set(
      placed.map((item: any) => item.topic.id)
    )
  ];

  const previous = await previousDetails(
    schoolId,
    topicIds
  );

  const now = new Date();

  const items = placed.map(
    ({ date, periodId, topic }: { date: string; periodId: string; topic: any }) => {
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
  ctx: RequestContext,
  user: AuthUser,
  { status, teacherId }: { status?: string; teacherId?: string }
) {
  const filter: any = {
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

export async function getPlan(ctx: RequestContext, user: AuthUser, id: any) {
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
    (slot: any) =>
      slot.sectionId === plan.sectionId &&
      slot.subjectId !== plan.subjectId
  );

  const holidays = sch.holidays.filter(
    (holiday: any) =>
      holiday.date >= plan.startDate &&
      holiday.date <= plan.endDate
  );

  const exams = sch.exams.filter(
    (exam: any) =>
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

    otherSlots: slots.map((slot: any) => ({
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
  schoolId: string,
  input: any,
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
      (template: any) =>
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
    (template: any) => template.isDefault
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
  ctx: RequestContext,
  user: AuthUser,
  body: any
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
  ctx: RequestContext,
  user: AuthUser,
  id: any
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
  ctx: RequestContext,
  user: AuthUser,
  id: any,
  { endDate }: { endDate: string }
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
  ctx: RequestContext,
  user: AuthUser,
  id: any,
  patch: any
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
        (topic: any) =>
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
export async function submitPlan(ctx: RequestContext, user: AuthUser, id: any) {
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
  await notifyReviewers(ctx.schoolId, plan);

  return plan.toJSON();
}

// -----------------------------------------
// Bell notification for the reviewer
// -----------------------------------------
// The HOD of the subject's department gets it. The principal(s) get it instead when
// the department has no HOD, the HOD is inactive, or settings say only the principal approves.
// Never breaks the submit: if approval-service is down, it is only logged.
async function notifyReviewers(schoolId: string, plan: any) {
  try {
    const school = await getSchoolData(schoolId);
    const byId = (list: any[] = []): Map<string, any> =>
      new Map(list.map((x: any) => [x.id, x]));
    const staff = byId(school.staff);

    const subject = byId(school.subjects).get(plan.subjectId);
    const department = byId(school.departments).get(subject?.departmentId);
    const hod = department?.hodId ? staff.get(department.hodId) : undefined;
    const hodAvailable = !!hod && hod.active !== false;
    const principalOnly = school.settings?.approver === "principal";

    const principals: string[] = (school.staff || [])
      .filter((s: any) => s.role === "principal" && s.active !== false)
      .map((s: any) => s.id);
    const to: string[] = principalOnly || !hodAvailable ? principals : [hod.id];

    const section = byId(school.sections).get(plan.sectionId);
    const cls = byId(school.classes).get(section?.classId ?? plan.classId);
    const label =
      `${cls?.name ?? ""}${section ? `-${section.name}` : ""} ${subject?.name ?? ""}`.trim() || "lesson";
    const teacher = staff.get(plan.teacherId)?.name || "A teacher";

    await notify(
      schoolId,
      to,
      "Plan waiting for approval",
      `${teacher} submitted the ${label} plan for your review.`,
      `/lesson-planner/plans/${plan.id}`
    );
  } catch (err: any) {
    console.warn(`[lesson-plan-service] could not notify reviewers: ${err.message}`);
  }
}