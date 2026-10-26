// Shared helpers for the mock API: response wrappers, lookups, lesson helpers.
import { LESSON_STATUS, PERIODS, periodById } from '@/utils/constants';
import { classes, sections, staff, subjects } from '../seed';
import { db, uid } from '../mockDb';

export const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export const ok = async (data, message = 'OK') => {
  await wait();
  return { success: true, data: JSON.parse(JSON.stringify(data)), message };
};

export const fail = async (message) => {
  await wait();
  const e = new Error(message);
  e.response = { data: { success: false, message } };
  throw e;
};

export const byId = (list, id) => list.find((x) => x.id === id);

export const sectionLabel = (sectionId) => {
  const sec = byId(sections, sectionId);
  return sec ? `${byId(classes, sec.classId).name}-${sec.name}` : '';
};

export const enrich = (it) => {
  const p = periodById(it.periodId);
  const plan = byId(db().plans, it.planId);
  return {
    ...it,
    classLabel: sectionLabel(it.sectionId),
    subjectName: byId(subjects, it.subjectId)?.name,
    teacherName: byId(staff, it.teacherId)?.name,
    periodLabel: p?.label,
    start: p?.start,
    end: p?.end,
    planStatus: plan?.status,
  };
};

export const planSummary = (plan) => {
  const items = db().items.filter((i) => i.planId === plan.id);
  const count = (st) => items.filter((i) => i.status === st).length;
  return {
    ...plan,
    classLabel: sectionLabel(plan.sectionId),
    subjectName: byId(subjects, plan.subjectId)?.name,
    teacherName: byId(staff, plan.teacherId)?.name,
    createdByName: plan.createdBy ? byId(staff, plan.createdBy)?.name : undefined,
    assignedByAdmin: Boolean(plan.createdBy) && plan.createdBy !== plan.teacherId,
    total: items.filter((i) => i.status !== LESSON_STATUS.RESCHEDULED).length,
    completed: count(LESSON_STATUS.COMPLETED),
    missingDetails: items.filter(
      (i) => i.status === LESSON_STATUS.PLANNED && (!i.details?.objectives?.length || !i.details?.method),
    ).length,
  };
};

export const canSeeAll = (role) => role !== 'teacher';

export const notify = (to, title, text, link) =>
  db().notifications.unshift({ id: uid('n'), to, title, text, link, at: new Date().toISOString(), read: false });

export const syllabusFor = (classId, subjectId) =>
  db().syllabus.find((s) => s.classId === classId && s.subjectId === subjectId);

// Used by auto-shift (after marking) and by drag & drop.
// The unfinished topic goes into the chosen period. Every later planned lesson of the same
// class + subject moves forward by one period (content moves, periods stay). If the topic was
// already carried forward before, that copy is removed so it is never taught twice. If the last
// lesson no longer fits, it goes to the next free period of this class and the plan is extended.
const CONTENT_KEYS = ['topicId', 'topicTitle', 'chapterId', 'chapterTitle', 'details', 'continued', 'continuationOf'];

export const pickContent = (it) => Object.fromEntries(CONTENT_KEYS.map((k) => [k, it[k] ?? null]));

export const isLive = (x) => ![LESSON_STATUS.RESCHEDULED, LESSON_STATUS.CANCELLED].includes(x.status);

export const periodIndex = (id) => PERIODS.findIndex((p) => p.id === id);

export const isBlockedDay = (s, d) => s.holidays.some((h) => h.date === d) || s.exams.some((e) => e.date === d);