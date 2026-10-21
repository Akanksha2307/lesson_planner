import { AuthUser } from "../types";
// Reports page: syllabus coverage and the teacher report.
// Same shapes and rules as the frontend mock (src/services/mock/api/reports.js),
// so the Reports page works without any change.
import { Plan, PlanItem, LESSON_STATUS, PLAN_STATUS } from "../models/plans.model";
import { Syllabus } from "../models/syllabus.model";
import { getSchoolData } from "./school-client.service";
import { addDays, startOfWeek, todayISO } from "../utils/dates";

const byId = (list: any[] = []) => new Map(list.map((x) => [x.id, x]));

// completed = 1 period taught, partial = half a period
function taughtPeriods(items: any) {
  const map: Record<string, number> = {};
  for (const it of items) {
    if (it.status === LESSON_STATUS.COMPLETED) map[it.topicId] = (map[it.topicId] || 0) + 1;
    if (it.status === LESSON_STATUS.PARTIAL) map[it.topicId] = (map[it.topicId] || 0) + 0.5;
  }
  return map;
}

// % of each chapter done, and of the whole syllabus
function coverage(syllabus: any, items: any) {
  const taught = taughtPeriods(items);
  let doneAll = 0;
  let totalAll = 0;
  const chapters = (syllabus.chapters || []).map((ch: any) => {
    let done = 0;
    let total = 0;
    for (const tp of ch.topics || []) {
      const est = tp.estPeriods || 1;
      total += est;
      done += Math.min(est, taught[String(tp._id ?? tp.id)] || 0);
    }
    doneAll += done;
    totalAll += total;
    return {
      id: String(ch._id ?? ch.id),
      title: ch.title,
      term: ch.term,
      percent: total ? Math.round((done / total) * 100) : 0,
      topics: (ch.topics || []).length
    };
  });
  return { chapters, overall: totalAll ? Math.round((doneAll / totalAll) * 100) : 0 };
}

// GET /reports/coverage?sectionId=&subjectId=  → one row per class section + subject in the timetable
export async function coverageReport(schoolId: string, user: AuthUser, { sectionId, subjectId }: { sectionId?: string; subjectId?: string } = {}) {
  const school = await getSchoolData(schoolId);
  const sections = byId(school.sections);
  const classes = byId(school.classes);
  const subjects = byId(school.subjects);
  const staff = byId(school.staff);

  // Unique section + subject pairs from the timetable (first teacher found teaches it)
  const pairs = new Map();
  for (const t of school.timetable || []) {
    const key = `${t.sectionId}|${t.subjectId}`;
    if (!pairs.has(key)) pairs.set(key, t);
  }

  let assignments = [...pairs.values()].filter(
    (a) => (!sectionId || a.sectionId === sectionId) && (!subjectId || a.subjectId === subjectId)
  );
  if (user.role === "teacher") assignments = assignments.filter((a) => a.teacherId === user.id);
  if (!assignments.length) return [];

  const [syllabi, items] = await Promise.all([
    Syllabus.find({ schoolId }).lean(),
    PlanItem.find(
      { schoolId, sectionId: { $in: assignments.map((a) => a.sectionId) } },
      { sectionId: 1, subjectId: 1, topicId: 1, status: 1 }
    ).lean()
  ]);

  return assignments.map((a) => {
    const sec = sections.get(a.sectionId);
    const syl = syllabi.find((s) => s.classId === sec?.classId && s.subjectId === a.subjectId);
    const c = syl
      ? coverage(syl, items.filter((i) => i.sectionId === a.sectionId && i.subjectId === a.subjectId))
      : null;
    return {
      sectionId: a.sectionId,
      subjectId: a.subjectId,
      classLabel: sec ? `${classes.get(sec.classId)?.name || ""}-${sec.name}` : a.sectionId,
      subjectName: subjects.get(a.subjectId)?.name || a.subjectId,
      teacherName: staff.get(a.teacherId)?.name || a.teacherId,
      hasSyllabus: !!syl,
      overall: c?.overall || 0,
      chapters: c?.chapters || []
    };
  });
}

// GET /reports/teachers  → one row per teacher (a teacher only sees their own row)
export async function teacherReport(schoolId: string, user: AuthUser) {
  const school = await getSchoolData(schoolId);
  const departments = byId(school.departments);
  let teachers = (school.staff || []).filter((s: any) => s.role === "teacher" && s.active !== false);
  if (user.role === "teacher") teachers = teachers.filter((t: any) => t.id === user.id);
  if (!teachers.length) return [];

  const ids = teachers.map((t: any) => t.id);
  const today = todayISO();
  const nextWs = addDays(startOfWeek(today), 7); // next Monday

  const [items, plans] = await Promise.all([
    PlanItem.find(
      { schoolId, teacherId: { $in: ids }, date: { $lte: today }, status: { $ne: LESSON_STATUS.RESCHEDULED } },
      { teacherId: 1, date: 1, status: 1 }
    ).lean(),
    Plan.find(
      { schoolId, teacherId: { $in: ids } },
      { teacherId: 1, sectionId: 1, subjectId: 1, startDate: 1, endDate: 1, status: 1, reviews: 1 }
    ).lean()
  ]);

  return teachers.map((t: any) => {
    const mine = items.filter((i) => i.teacherId === t.id);
    const count = (st: any) => mine.filter((i) => i.status === st).length;
    const myPlans = plans.filter((p) => p.teacherId === t.id);
    const reviews = myPlans.flatMap((p) => p.reviews || []);

    const assignments = [
      ...new Set((school.timetable || []).filter((x: any) => x.teacherId === t.id).map((x: any) => `${x.sectionId}|${x.subjectId}`))
    ];
    const nextWeekDone = assignments.filter((k) =>
      myPlans.some(
        (p) =>
          `${p.sectionId}|${p.subjectId}` === k &&
          p.startDate <= nextWs &&
          p.endDate >= nextWs &&
          p.status !== PLAN_STATUS.DRAFT
      )
    ).length;

    const completed = count(LESSON_STATUS.COMPLETED);
    return {
      id: t.id,
      name: t.name,
      department: departments.get(t.departmentId)?.name || "",
      planned: mine.length,
      completed,
      partial: count(LESSON_STATUS.PARTIAL),
      notDone: count(LESSON_STATUS.NOT_DONE),
      cancelled: count(LESSON_STATUS.CANCELLED),
      completionRate: mine.length ? Math.round((completed / mine.length) * 100) : 0,
      approvalRate: reviews.length
        ? Math.round((reviews.filter((r) => r.action === "approved").length / reviews.length) * 100)
        : 0,
      nextWeek: `${nextWeekDone}/${assignments.length}`,
      pendingMarking: mine.filter((i) => i.status === LESSON_STATUS.PLANNED && i.date < today).length
    };
  });
}