// Lesson plans: create (auto-fill from syllabus + timetable), list, view, delete, extend,
// and edit a single lesson. Rules match the frontend mock (services/mock/api/plans.js).
import { Plan, PlanItem, PLAN_STATUS, LESSON_STATUS, emptyDetails } from './plans.model.js';
import { byDateAndPeriod, flatTopics, generatePlanItems } from './plans.engine.js';
import { Syllabus } from '../syllabus/syllabus.model.js';
import { Exam, Holiday, SchoolClass, Section, Staff, Subject, Template, TimetableSlot } from '../masters/masters.model.js';
import { getSettings } from '../masters/masters.service.js';
import { addDays, todayISO } from '../../common/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/response.js';

const LIVE = (s) => s !== LESSON_STATUS.RESCHEDULED && s !== LESSON_STATUS.CANCELLED;
const MAX_PLAN_DAYS = 200;

// ---------- school lookups (names, periods, settings) ----------
export async function loadSchool(schoolId) {
  const [classes, sections, subjects, staff, settings] = await Promise.all([
    SchoolClass.find({ schoolId }),
    Section.find({ schoolId }),
    Subject.find({ schoolId }),
    Staff.find({ schoolId }),
    getSettings(schoolId),
  ]);
  const map = (list) => new Map(list.map((x) => [x.id, x]));
  const [cls, sec, sub, stf] = [map(classes), map(sections), map(subjects), map(staff)];
  const bell = settings.bellSchedule || [];
  const periods = new Map(bell.map((b) => [b.id, b]));
  return {
    settings,
    periodIds: bell.filter((b) => b.type === 'period').map((b) => b.id),
    section: (id) => sec.get(id),
    sectionLabel: (id) => {
      const s = sec.get(id);
      return s ? `${cls.get(s.classId)?.name}-${s.name}` : '';
    },
    subjectName: (id) => sub.get(id)?.name,
    staff: (id) => stf.get(id),
    period: (id) => periods.get(id),
  };
}

// Lesson + the names the screens show (same fields as the mock's enrich())
export function enrich(item, sch, planStatus) {
  const it = typeof item.toJSON === 'function' ? item.toJSON() : item;
  const p = sch.period(it.periodId);
  return {
    ...it,
    classLabel: sch.sectionLabel(it.sectionId),
    subjectName: sch.subjectName(it.subjectId),
    teacherName: sch.staff(it.teacherId)?.name,
    periodLabel: p?.label,
    start: p?.start,
    end: p?.end,
    planStatus,
  };
}

const missingDetails = (i) => i.status === LESSON_STATUS.PLANNED && (!i.details?.objectives?.length || !i.details?.method);

// Plan + counts (same fields as the mock's planSummary())
async function summaries(plans, sch) {
  if (!plans.length) return [];
  const items = await PlanItem.find(
    { planId: { $in: plans.map((p) => p.id) } },
    { planId: 1, status: 1, 'details.objectives': 1, 'details.method': 1 },
  ).lean();
  return plans.map((plan) => {
    const mine = items.filter((i) => i.planId === plan.id);
    return {
      ...plan.toJSON(),
      classLabel: sch.sectionLabel(plan.sectionId),
      subjectName: sch.subjectName(plan.subjectId),
      teacherName: sch.staff(plan.teacherId)?.name,
      total: mine.filter((i) => i.status !== LESSON_STATUS.RESCHEDULED).length,
      completed: mine.filter((i) => i.status === LESSON_STATUS.COMPLETED).length,
      missingDetails: mine.filter(missingDetails).length,
    };
  });
}

// ---------- who may do what ----------
const isOwnerOrAdmin = (user, plan) => user.role === 'admin' || plan.teacherId === user.id;

async function findPlan(ctx, user, id) {
  const plan = await Plan.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!plan) throw notFound('This plan does not exist or was deleted.');
  if (user.role === 'teacher' && plan.teacherId !== user.id) throw forbidden('This is another teacher’s plan.');
  return plan;
}

// When an approved plan is changed and the school wants re-approval, it goes back to draft.
function backToDraftIfNeeded(plan, settings) {
  if (plan.status === PLAN_STATUS.APPROVED && settings.approvalRequired && settings.editAfterApproval === 'reapprove') {
    plan.status = PLAN_STATUS.DRAFT;
    return true;
  }
  return false;
}

// ---------- shared by create + extend ----------
async function planningInputs(schoolId, { classId, sectionId, subjectId, teacherId }, settings) {
  const syllabus = await Syllabus.findOne({ schoolId, classId, subjectId });
  if (!syllabus) throw badRequest('No syllabus found for this class and subject. Ask the admin to add it first.');
  const slots = await TimetableSlot.find({ schoolId, sectionId, subjectId, teacherId }).lean();
  if (!slots.length) throw badRequest('There are no timetable periods for this teacher, class and subject.');
  const existing = await PlanItem.find({ schoolId, sectionId, subjectId }).lean();
  const [holidays, exams] = await Promise.all([
    settings.skipHolidays ? Holiday.find({ schoolId }).lean() : [],
    settings.skipExams ? Exam.find({ schoolId }).lean() : [],
  ]);
  return {
    syllabus: syllabus.toJSON(),
    slots,
    existing,
    plannedKeys: new Set(existing.filter((i) => LIVE(i.status)).map((i) => `${i.date}|${i.periodId}`)),
    blockedDates: new Set([...holidays.map((h) => h.date), ...exams.map((e) => e.date)]),
  };
}

// New lessons start with the details of the latest lesson on the same topic (lesson library)
async function previousDetails(schoolId, topicIds) {
  const prev = await PlanItem.find({ schoolId, topicId: { $in: topicIds }, 'details.objectives.0': { $exists: true } })
    .sort({ createdAt: -1 })
    .lean();
  const byTopic = new Map();
  prev.forEach((p) => {
    if (!byTopic.has(p.topicId)) byTopic.set(p.topicId, p);
  });
  return byTopic;
}

async function insertLessons(schoolId, plan, placed, action) {
  const prev = await previousDetails(schoolId, [...new Set(placed.map((p) => p.topic.id))]);
  const now = new Date();
  const items = placed.map(({ date, periodId, topic }) => {
    const from = prev.get(topic.id);
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
      details: from ? { ...structuredClone(from.details), prefilledFrom: from._id } : emptyDetails(),
      history: [{ at: now, action }],
    };
  });
  await PlanItem.insertMany(items);
  return items.length;
}

// ---------- API ----------
export async function listPlans(ctx, user, { status, teacherId }) {
  const filter = { schoolId: ctx.schoolId };
  if (user.role === 'teacher') filter.teacherId = user.id;
  else if (teacherId) filter.teacherId = teacherId;
  if (status) filter.status = status;
  const [plans, sch] = await Promise.all([Plan.find(filter).sort({ startDate: -1 }), loadSchool(ctx.schoolId)]);
  return summaries(plans, sch);
}

export async function getPlan(ctx, user, id) {
  const plan = await findPlan(ctx, user, id);
  const { schoolId } = ctx;
  const [sch, items, syllabus, slots, holidays, exams, templates] = await Promise.all([
    loadSchool(schoolId),
    PlanItem.find({ planId: id }),
    Syllabus.findOne({ schoolId, classId: plan.classId, subjectId: plan.subjectId }),
    TimetableSlot.find({ schoolId, sectionId: plan.sectionId, subjectId: { $ne: plan.subjectId } }),
    Holiday.find({ schoolId, date: { $gte: plan.startDate, $lte: plan.endDate } }),
    Exam.find({ schoolId, date: { $gte: plan.startDate, $lte: plan.endDate } }),
    Template.find({ schoolId }).sort({ order: 1 }),
  ]);
  const [summary] = await summaries([plan], sch);
  const template = templates.find((t) => t.id === plan.templateId) || templates.find((t) => t.isDefault) || templates[0];
  return {
    plan: {
      ...summary,
      reviews: plan.reviews.map((r) => ({ ...r.toJSON(), byName: sch.staff(r.by)?.name, byRole: sch.staff(r.by)?.role })),
    },
    items: items.map((i) => enrich(i, sch, plan.status)).sort(byDateAndPeriod(sch.periodIds)),
    // What the class has in its other periods (for the plan's week grid)
    otherSlots: slots.map((t) => ({ ...t.toJSON(), subjectName: sch.subjectName(t.subjectId), teacherName: sch.staff(t.teacherId)?.name })),
    template: template?.toJSON() || null,
    holidays: holidays.map((h) => h.toJSON()),
    exams: exams.map((e) => e.toJSON()),
    topics: syllabus ? flatTopics(syllabus.toJSON()) : [],
  };
}

// Create a plan and fill it with lessons. Also used by the demo seed (with a status).
export async function createPlan(schoolId, input, status = PLAN_STATUS.DRAFT) {
  const { teacherId, classId, sectionId, subjectId, startDate, endDate, templateId } = input;
  const settings = await getSettings(schoolId);
  const sch = await loadSchool(schoolId);

  const section = sch.section(sectionId);
  if (!section || section.classId !== classId) throw badRequest('That section is not part of this class.');
  if (!sch.staff(teacherId)) throw badRequest('Teacher not found.');
  if (addDays(startDate, MAX_PLAN_DAYS) < endDate) throw badRequest(`A plan can cover at most ${MAX_PLAN_DAYS} days.`);
  if (templateId && !(await Template.exists({ _id: templateId, schoolId }))) throw badRequest('Template not found.');

  const inp = await planningInputs(schoolId, input, settings);
  const { placed, unscheduled, skippedDays } = generatePlanItems({
    ...inp,
    existingItems: inp.existing,
    startDate,
    endDate,
    periodIds: sch.periodIds,
  });
  if (!placed.length) throw badRequest('Nothing to plan: all periods in these dates are already planned or are holidays.');

  const plan = await Plan.create({
    schoolId,
    teacherId,
    classId,
    sectionId,
    subjectId,
    startDate,
    endDate,
    templateId: templateId || (await Template.findOne({ schoolId, isDefault: true }))?.id,
    status,
  });
  const placedCount = await insertLessons(schoolId, plan, placed, 'created');
  const [summary] = await summaries([plan], sch);
  return { plan: summary, unscheduled, skippedDays, placedCount };
}

export async function generatePlan(ctx, user, body) {
  let teacherId = body.teacherId;
  if (user.role === 'teacher') teacherId = user.id; // a teacher can only plan for themselves
  else if (!teacherId) throw badRequest('Choose the teacher this plan is for.');
  return createPlan(ctx.schoolId, { ...body, teacherId });
}

export async function deletePlan(ctx, user, id) {
  const plan = await findPlan(ctx, user, id);
  if (!isOwnerOrAdmin(user, plan)) throw forbidden('Only the teacher of this plan can delete it.');
  if (await PlanItem.exists({ planId: id, status: { $ne: LESSON_STATUS.PLANNED } })) {
    throw conflict('This plan has lessons already marked. It cannot be deleted.');
  }
  await PlanItem.deleteMany({ planId: id });
  await Plan.deleteOne({ _id: id });
}

// Adds the next syllabus topics into this class's periods between the old and the new end date.
export async function extendPlan(ctx, user, id, { endDate }) {
  const plan = await findPlan(ctx, user, id);
  if (!isOwnerOrAdmin(user, plan)) throw forbidden('Only the teacher of this plan can extend it.');
  if (plan.status === PLAN_STATUS.SUBMITTED) throw conflict('This plan is waiting for approval. Extend it after it is reviewed.');
  if (endDate <= plan.endDate) throw badRequest(`Choose a date after the current end date (${plan.endDate}).`);
  if (addDays(plan.startDate, MAX_PLAN_DAYS) < endDate) throw badRequest(`A plan can cover at most ${MAX_PLAN_DAYS} days.`);

  const settings = await getSettings(ctx.schoolId);
  const sch = await loadSchool(ctx.schoolId);
  const inp = await planningInputs(ctx.schoolId, plan, settings);
  const nextDay = addDays(plan.endDate, 1);
  const from = nextDay > todayISO() ? nextDay : todayISO();
  const { placed } = generatePlanItems({ ...inp, existingItems: inp.existing, startDate: from, endDate, periodIds: sch.periodIds });
  if (!placed.length) {
    throw badRequest('No lessons to add – the syllabus is already fully planned, or there are no free periods in these dates.');
  }

  const added = await insertLessons(ctx.schoolId, plan, placed, 'added when plan was extended');
  plan.endDate = endDate;
  const planStatusChanged = backToDraftIfNeeded(plan, settings);
  await plan.save();
  return { added, planStatusChanged, endDate };
}

// Edit one lesson's details (and optionally change its topic).
export async function updateItem(ctx, user, id, patch) {
  const item = await PlanItem.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!item) throw notFound('Lesson not found.');
  const plan = await findPlan(ctx, user, item.planId);
  if (!isOwnerOrAdmin(user, plan)) throw forbidden('Only the teacher of this plan can edit its lessons.');
  if (plan.status === PLAN_STATUS.SUBMITTED) throw conflict('This plan is waiting for approval. You can edit it after it is reviewed.');
  if (!LIVE(item.status)) throw conflict('This lesson was rescheduled or cancelled, so it cannot be edited.');

  if (patch.details) item.details = { ...(item.details || emptyDetails()), ...patch.details };
  if (patch.topicId && patch.topicId !== item.topicId) {
    const syl = await Syllabus.findOne({ schoolId: ctx.schoolId, classId: item.classId, subjectId: item.subjectId });
    const topic = syl && flatTopics(syl.toJSON()).find((t) => t.id === patch.topicId);
    if (!topic) throw badRequest('That topic is not in this syllabus.');
    Object.assign(item, { topicId: topic.id, topicTitle: topic.title, chapterId: topic.chapterId, chapterTitle: topic.chapterTitle });
  }
  item.history.push({ at: new Date(), action: 'edited', by: user.id });
  item.markModified('details');
  await item.save();

  const settings = await getSettings(ctx.schoolId);
  const planStatusChanged = backToDraftIfNeeded(plan, settings);
  if (planStatusChanged) await plan.save();
  const sch = await loadSchool(ctx.schoolId);
  return { item: enrich(item, sch, plan.status), planStatusChanged };
}