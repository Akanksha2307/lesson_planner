import { conflict } from "../utils/response.js";

import { Plan, PlanItem, PLAN_STATUS, LESSON_STATUS } from "../models/plans.model.js";
import { addDays, todayISO, weekdayIndex } from "../utils/dates.js";
import { byDateAndPeriod } from "./plans.engine.js";
import { loadSchool } from "./plans.service.js";
const INACTIVE = [LESSON_STATUS.CANCELLED, LESSON_STATUS.RESCHEDULED];
const CONTENT = ["topicId", "topicTitle", "chapterId", "chapterTitle", "details", "continued", "continuationOf"];
const sameId = (a, b) => String(a) === String(b);
const contentOf = item => Object.fromEntries(CONTENT.map(key => [key, item[key]]));
const contentEqual = (item, content) => CONTENT.every(key =>
  JSON.stringify(item[key] ?? null) === JSON.stringify(content[key] ?? null)
);
function putContent(item, content) {
  for (const key of CONTENT) item[key] = content[key];
  item.markModified("details");
}
function blocked(school, date) {
  const holidays = school.settings?.skipHolidays !== false &&
    (school.holidays || []).some(h => h.date === date);
  const exams = school.settings?.skipExams !== false &&
    (school.exams || []).some(e => {
      const start = e.startDate || e.date;
      return start && date >= start && date <= (e.endDate || start);
    });
  return holidays || exams;
}
function slotsFor(school, item, date) {
  return (school.timetable || []).filter(s =>
    s.sectionId === item.sectionId && s.subjectId === item.subjectId &&
    s.teacherId === item.teacherId && s.weekday === ((weekdayIndex(date) + 1) % 7)
  ).sort((a, b) => school.periodIds.indexOf(a.periodId) - school.periodIds.indexOf(b.periodId));
}
function started(school, date, periodId) {
  const period = (school.settings?.bellSchedule || []).find(p => p.id === periodId && p.type === "period");
  if (!period?.start) throw new Error(`Period start time missing: ${periodId}`);
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = period.start.split(":").map(Number);
  // Server timezone must match the school's timezone.
  return Date.now() >= new Date(y, m - 1, d, h, min).getTime();
}
async function conflicts(ctx, item, date, periodId, session) {
  const q = PlanItem.find({
    schoolId: ctx.schoolId, date, periodId,
    $or: [{ sectionId: item.sectionId }, { teacherId: item.teacherId }],
    status: { $nin: INACTIVE }
  });
  if (session) q.session(session);
  return q;
}
async function editablePlan(ctx, item, school, session) {
  const plan = await Plan.findOne({
    _id: item.planId, schoolId: ctx.schoolId, teacherId: item.teacherId
  }).session(session);
  if (!plan) throw new Error("Lesson plan not found.");
  if (plan.status === PLAN_STATUS.SUBMITTED) {
    throw new Error("Plan is awaiting HOD approval; automatic shifting is blocked.");
  }
  if (plan.status === PLAN_STATUS.APPROVED && school.settings?.approvalRequired &&
      school.settings?.editAfterApproval === "reapprove") {
    throw new Error("Approved plan requires reapproval before automatic shifting.");
  }
  return plan;
}
async function futureGroup(ctx, item, sort, session) {
  const group = await PlanItem.find({
    schoolId: ctx.schoolId, planId: item.planId,
    sectionId: item.sectionId, subjectId: item.subjectId,
    teacherId: item.teacherId, status: LESSON_STATUS.PLANNED
  }).session(session);
  return group.filter(x => sort(x, item) > 0).sort(sort);
}
async function freeAfter(ctx, item, school, after, sort, session) {
  for (let date = after.date, day = 0; day < 120; date = addDays(date, 1), day++) {
    if (date < todayISO() || blocked(school, date)) continue;
    for (const slot of slotsFor(school, item, date)) {
      const candidate = { date, periodId: slot.periodId };
      if (sort(candidate, after) <= 0 || started(school, date, slot.periodId)) continue;
      if (!(await conflicts(ctx, item, date, slot.periodId, session)).length) return candidate;
    }
  }
  return null;
}
export async function nextClassPeriod(ctx, item, session = null) {
  const school = await loadSchool(ctx.schoolId);
  const sort = byDateAndPeriod(school.periodIds);
  for (let date = item.date, day = 0; day < 120; date = addDays(date, 1), day++) {
    if (date < todayISO() || blocked(school, date)) continue;
    for (const slot of slotsFor(school, item, date)) {
      const target = { date, periodId: slot.periodId };
      if (sort(target, item) <= 0 || started(school, date, slot.periodId)) continue;
      const busy = await conflicts(ctx, item, date, slot.periodId, session);
      if (!busy.length || (busy.length === 1 &&
        busy[0].status === LESSON_STATUS.PLANNED &&
        sameId(busy[0].planId, item.planId) &&
        busy[0].sectionId === item.sectionId &&
        busy[0].subjectId === item.subjectId &&
        busy[0].teacherId === item.teacherId)) return target;
    }
  }
  return null;
}
export async function continueCore(ctx, item, target, session) {
  if (!session) throw new Error("MongoDB transaction required.");
  if (![LESSON_STATUS.PARTIAL, LESSON_STATUS.NOT_DONE].includes(item.status)) {
    throw new Error("Only unfinished lessons can be continued.");
  }
  const school = await loadSchool(ctx.schoolId);
  const sort = byDateAndPeriod(school.periodIds);
  const plan = await editablePlan(ctx, item, school, session);
  if (!target || sort(target, item) <= 0 || target.date < todayISO() ||
      blocked(school, target.date) || started(school, target.date, target.periodId) ||
      !slotsFor(school, item, target.date).some(s => s.periodId === target.periodId)) {
    throw new Error("Invalid continuation period.");
  }
  const group = await futureGroup(ctx, item, sort, session);
  if (group.some(x => sameId(x.continuationOf, item._id))) {
    throw conflict("This lesson already has a continuation.");
  }
  const existing = group.find(x => x.date === target.date && x.periodId === target.periodId);
  const busy = await conflicts(ctx, item, target.date, target.periodId, session);
  if (busy.some(x => !existing || !sameId(x._id, existing._id))) {
    throw new Error("Target period belongs to another lesson.");
  }
  const schedule = [...group];
  if (!existing) schedule.push({ __new: true, ...target });
  schedule.sort(sort);
  const index = schedule.findIndex(x => x.date === target.date && x.periodId === target.periodId);
  const contents = group.map(contentOf);
  contents.splice(index, 0, { ...contentOf(item), continued: true, continuationOf: String(item._id) });
  if (contents.length > schedule.length) {
    const free = await freeAfter(ctx, item, school, schedule[schedule.length - 1], sort, session);
    if (!free) throw new Error("No free timetable period within 120 days.");
    schedule.push({ __new: true, ...free });
  }
  const now = new Date();
  const changed = [];
  for (let i = 0; i < schedule.length; i++) {
    const slot = schedule[i], content = contents[i];
    if (!content) continue;
    const action = sameId(content.continuationOf, item._id)
      ? "continued here" : "shifted after lesson continuation";
    if (slot.__new) {
      const created = new PlanItem({
        schoolId: ctx.schoolId, planId: plan._id,
        teacherId: item.teacherId, classId: item.classId,
        sectionId: item.sectionId, subjectId: item.subjectId,
        date: slot.date, periodId: slot.periodId,
        status: LESSON_STATUS.PLANNED, completion: null,
        ...content, history: [{ at: now, action, by: item.teacherId }]
      });
      await created.save({ session });
      changed.push(created.toJSON());
      if (slot.date > plan.endDate) plan.endDate = slot.date;
    } else if (!contentEqual(slot, content)) {
      putContent(slot, content);
      slot.history.push({ at: now, action, by: item.teacherId });
      await slot.save({ session });
      changed.push(slot.toJSON());
    }
  }
  if (plan.isModified("endDate")) await plan.save({ session });
  item.history.push({ at: now, action: `continues on ${target.date} (${target.periodId})`, by: item.teacherId });
  await item.save({ session });
  return { changed };
}
export async function removeContinuation(ctx, item, session) {
  if (!session) throw new Error("MongoDB transaction required.");
  const school = await loadSchool(ctx.schoolId);
  const sort = byDateAndPeriod(school.periodIds);
  await editablePlan(ctx, item, school, session);
  const group = await futureGroup(ctx, item, sort, session);
  const copy = group.find(x => sameId(x.continuationOf, item._id));
  if (!copy) return 0;
  const contents = group.filter(x => !sameId(x._id, copy._id)).map(contentOf);
  const now = new Date();
  let moved = 0;
  for (let i = 0; i < group.length; i++) {
    const slot = group[i], content = contents[i];
    if (!content) {
      await PlanItem.deleteOne({ _id: slot._id, schoolId: ctx.schoolId, planId: item.planId }).session(session);
    } else if (!contentEqual(slot, content)) {
      putContent(slot, content);
      slot.history.push({ at: now, action: "moved back after continuation removed", by: item.teacherId });
      await slot.save({ session });
      moved++;
    }
  }
  item.history.push({ at: now, action: "automatic continuation removed", by: item.teacherId });
  await item.save({ session });
  return moved;
}

