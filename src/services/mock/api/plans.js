// Plans: list, detail, create, delete, submit, review, extend.
import { addDays, todayISO } from '@/utils/date';
import { LESSON_STATUS, PLAN_STATUS } from '@/utils/constants';
import { staff, subjects, timetable } from '../seed';
import { generatePlanItems, sortItems } from '../engine';
import { createPlan, db, emptyDetails, planPlacement, save, uid } from '../mockDb';
import { PERIODS } from '@/utils/constants';
import { ok, fail, byId, sectionLabel, enrich, planSummary, canSeeAll, notify, syllabusFor, isLive } from './helpers';

export const getPlans = ({ userId, role, status, teacherId }) => {
  let plans = db().plans;
  if (!canSeeAll(role)) plans = plans.filter((p) => p.teacherId === userId);
  else if (teacherId) plans = plans.filter((p) => p.teacherId === teacherId);
  if (status) plans = plans.filter((p) => p.status === status);
  return ok(plans.map(planSummary).sort((a, b) => (a.startDate < b.startDate ? 1 : -1)));
};

export const getPlan = (id) => {
  const s = db();
  const plan = byId(s.plans, id);
  if (!plan) return fail('This plan does not exist or was deleted.');
  const items = s.items
    .filter((i) => i.planId === id)
    .map(enrich)
    .sort(sortItems);
  const otherSlots = timetable
    .filter((t) => t.sectionId === plan.sectionId && t.subjectId !== plan.subjectId)
    .map((t) => ({ ...t, subjectName: byId(subjects, t.subjectId).name, teacherName: byId(staff, t.teacherId).name }));
  const syl = syllabusFor(plan.classId, plan.subjectId);
  const template = byId(s.templates, plan.templateId) || s.templates[0];
  const reviews = plan.reviews.map((r) => ({ ...r, byName: byId(staff, r.by)?.name, byRole: byId(staff, r.by)?.role }));
  return ok({
    plan: { ...planSummary(plan), reviews },
    items,
    otherSlots,
    template,
    holidays: s.holidays.filter((h) => h.date >= plan.startDate && h.date <= plan.endDate),
    exams: s.exams.filter((e) => e.date >= plan.startDate && e.date <= plan.endDate),
    topics: syl ? syl.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, chapterTitle: c.title }))) : [],
  });
};

// Teachers plan for themselves; an admin plans FOR a teacher (topics, note) – same rules as the server
const forTeacher = (body, by) => {
  if (!by || by.role === 'teacher') {
    if (body.topicIds?.length || body.topicPeriods || body.note)
      throw new Error('Only the admin can choose topics or add a note when creating a plan.');
    return { ...body, teacherId: by?.id || body.teacherId };
  }
  const teacher = byId(staff, body.teacherId);
  if (!body.teacherId) throw new Error('Choose the teacher this plan is for.');
  if (!teacher || teacher.role !== 'teacher' || teacher.active === false) throw new Error('Choose an active teacher.');
  return { ...body, createdBy: by.id, createdByRole: by.role };
};

export const previewPlan = (body, by) => {
  try {
    const { placed, unscheduled, skippedDays, freeSlots, neededPeriods } = planPlacement(db(), forTeacher(body, by));
    const totals = {};
    placed.forEach((p) => (totals[p.topic.id] = (totals[p.topic.id] || 0) + 1));
    const seen = {};
    return ok({
      lessons: placed.map((p) => {
        seen[p.topic.id] = (seen[p.topic.id] || 0) + 1;
        const period = PERIODS.find((x) => x.id === p.periodId);
        return {
          date: p.date,
          periodId: p.periodId,
          periodLabel: period?.label,
          start: period?.start,
          topicId: p.topic.id,
          topicTitle: p.topic.title,
          chapterId: p.topic.chapterId,
          chapterTitle: p.topic.chapterTitle,
          part: seen[p.topic.id],
          of: totals[p.topic.id],
        };
      }),
      unscheduled: unscheduled.map(({ id, title, chapterTitle, reason }) => ({ id, title, chapterTitle, reason })),
      skippedDays,
      freeSlots,
      neededPeriods,
    });
  } catch (e) {
    return fail(e.message);
  }
};

export const generatePlan = (body, by) => {
  try {
    const input = forTeacher(body, by);
    const res = createPlan(db(), input);
    if (input.createdBy && input.createdBy !== input.teacherId) {
      const sum = planSummary(res.plan);
      notify(
        input.teacherId,
        'New plan assigned to you',
        `${by.name || 'The admin'} (Admin) assigned you a ${sum.classLabel} ${sum.subjectName} plan · ${sum.total} lessons · ${sum.startDate} to ${sum.endDate}. Fill the lesson details and submit it.${input.note ? ` Note: “${input.note}”` : ''}`,
        `/lesson-planner/plans/${res.plan.id}`,
      );
    }
    save();
    return ok(
      {
        plan: planSummary(res.plan),
        unscheduled: res.unscheduled,
        skippedDays: res.skippedDays,
        placedCount: res.placedCount,
      },
      'Plan created',
    );
  } catch (e) {
    return fail(e.message);
  }
};

export const deletePlan = (id) => {
  const s = db();
  const plan = byId(s.plans, id);
  if (!plan) return fail('Plan not found.');
  if (s.items.some((i) => i.planId === id && i.status !== LESSON_STATUS.PLANNED))
    return fail('This plan has lessons already marked. It cannot be deleted.');
  s.plans = s.plans.filter((p) => p.id !== id);
  s.items = s.items.filter((i) => i.planId !== id);
  save();
  return ok(true, 'Plan deleted');
};

export const submitPlan = (id) => {
  const s = db();
  const plan = byId(s.plans, id);
  const items = s.items.filter((i) => i.planId === id && i.status === LESSON_STATUS.PLANNED);
  const missing = items.filter((i) => !i.details?.objectives?.length || !i.details?.method);
  if (missing.length)
    return fail(
      `${missing.length} lesson${missing.length > 1 ? 's are' : ' is'} missing objectives or teaching method. Fill them before submitting.`,
    );
  plan.status = s.settings.approvalRequired ? PLAN_STATUS.SUBMITTED : PLAN_STATUS.APPROVED;
  plan.submittedAt = new Date().toISOString();
  if (s.settings.approvalRequired) {
    const t = byId(staff, plan.teacherId);
    const label = `${sectionLabel(plan.sectionId)} ${byId(subjects, plan.subjectId).name}`;
    notify('t3', 'New plan to review', `${t.name} submitted ${label}.`, '/lesson-planner/approvals');
    // The principal is the backup reviewer when the HOD is busy
    const principal = staff.find((x) => x.role === 'principal');
    if (principal)
      notify(
        principal.id,
        'Plan waiting for HOD',
        `${t.name} submitted ${label}. You can review it if the HOD is busy.`,
        `/lesson-planner/plans/${id}`,
      );
  }
  save();
  return ok(planSummary(plan), s.settings.approvalRequired ? 'Plan sent to HOD' : 'Plan approved');
};

export const reviewPlan = (id, { action, comment, reviewerId }) => {
  const s = db();
  const plan = byId(s.plans, id);
  if (!plan) return fail('Plan not found.');
  // HOD and principal can both review – whoever is first wins, the other sees it is already done
  if (plan.status !== PLAN_STATUS.SUBMITTED) {
    const last = plan.reviews[plan.reviews.length - 1];
    return fail(`This plan was already reviewed${last ? ` by ${byId(staff, last.by)?.name}` : ''}.`);
  }
  if (action === 'returned' && !comment?.trim()) return fail('Add a comment so the teacher knows what to change.');
  const reviewer = byId(staff, reviewerId);
  const reviewerRole = reviewer?.role === 'principal' ? 'Principal' : 'HOD';
  plan.status = action === 'approved' ? PLAN_STATUS.APPROVED : PLAN_STATUS.RETURNED;
  plan.reviews.push({ id: uid('rev'), by: reviewerId, action, comment, at: new Date().toISOString() });
  const label = `${sectionLabel(plan.sectionId)} ${byId(subjects, plan.subjectId).name}`;
  const by = `${reviewer?.name || reviewerRole} (${reviewerRole})`;
  notify(
    plan.teacherId,
    action === 'approved' ? 'Plan approved' : 'Plan sent back',
    action === 'approved'
      ? `Your ${label} plan was approved by ${by}.`
      : `Your ${label} plan was sent back by ${by}: “${comment}”`,
    `/lesson-planner/plans/${id}`,
  );
  // Tell the HOD when the principal reviewed on their behalf
  if (reviewer?.role === 'principal') {
    const teacher = byId(staff, plan.teacherId);
    notify(
      't3',
      action === 'approved' ? 'Principal approved a plan' : 'Principal sent back a plan',
      `${reviewer.name} ${action === 'approved' ? 'approved' : 'sent back'} ${teacher?.name}'s ${label} plan on your behalf.`,
      `/lesson-planner/plans/${id}`,
    );
  }
  save();
  return ok(planSummary(plan), action === 'approved' ? 'Plan approved' : 'Plan sent back');
};

// Adds the next syllabus topics into this class's periods between the old and the new end date.
export const extendPlan = (id, { endDate }) => {
  const s = db();
  const plan = byId(s.plans, id);
  if (!plan) return fail('Plan not found.');
  if (plan.status === PLAN_STATUS.SUBMITTED)
    return fail('This plan is waiting for approval. Extend it after it is reviewed.');
  if (!endDate || endDate <= plan.endDate) return fail(`Choose a date after the current end date (${plan.endDate}).`);
  const syllabus = syllabusFor(plan.classId, plan.subjectId);
  if (!syllabus) return fail('No syllabus found for this class and subject.');

  const slots = timetable.filter(
    (t) => t.sectionId === plan.sectionId && t.subjectId === plan.subjectId && t.teacherId === plan.teacherId,
  );
  const existing = s.items.filter((i) => i.sectionId === plan.sectionId && i.subjectId === plan.subjectId);
  const plannedKeys = new Set(existing.filter(isLive).map((i) => `${i.date}|${i.periodId}`));
  const nextDay = addDays(plan.endDate, 1);
  const from = nextDay > todayISO() ? nextDay : todayISO();
  const { placed } = generatePlanItems({
    syllabus,
    slots,
    startDate: from,
    endDate,
    holidays: s.settings.skipHolidays ? s.holidays : [],
    exams: s.settings.skipExams ? s.exams : [],
    existingItems: existing,
    alreadyPlannedKeys: plannedKeys,
  });
  if (!placed.length)
    return fail(
      'No lessons to add – the syllabus is already fully planned, or there are no free periods in these dates.',
    );

  const now = new Date().toISOString();
  placed.forEach(({ date, periodId, topic }) => {
    const prev = [...s.items].reverse().find((i) => i.topicId === topic.id && i.details?.objectives?.length);
    s.items.push({
      id: uid('item'),
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
      details: prev ? { ...JSON.parse(JSON.stringify(prev.details)), prefilledFrom: prev.id } : emptyDetails(),
      completion: null,
      history: [{ at: now, action: 'added when plan was extended' }],
    });
  });
  plan.endDate = endDate;
  let planStatusChanged = false;
  if (
    plan.status === PLAN_STATUS.APPROVED &&
    s.settings.approvalRequired &&
    s.settings.editAfterApproval === 'reapprove'
  ) {
    plan.status = PLAN_STATUS.DRAFT;
    planStatusChanged = true;
  }
  save();
  return ok(
    { added: placed.length, planStatusChanged },
    `${placed.length} lesson${placed.length === 1 ? '' : 's'} added – plan now ends on ${endDate}`,
  );
};