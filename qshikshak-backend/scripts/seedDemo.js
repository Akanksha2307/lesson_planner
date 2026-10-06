// Loads the demo school from scripts/data/demo.json into MongoDB.
// ⚠ It first DELETES that school's existing demo data, so running it again resets the demo.
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { Plan, PlanItem, PLAN_STATUS, LESSON_STATUS } from '../src/modules/plans/plans.model.js';
import { createPlan } from '../src/modules/plans/plans.service.js';
import { suggestLesson } from '../src/modules/plans/plans.engine.js';
import { addDays, startOfWeek, todayISO } from '../src/common/dates.js';
import { Notification } from '../src/modules/notifications/notifications.model.js';
import { TopicLesson } from '../src/modules/library/library.model.js';
import { saveApprovedPlan } from '../src/modules/library/library.service.js';
import { Syllabus } from '../src/modules/syllabus/syllabus.model.js';
import {
  Department,
  Exam,
  Holiday,
  SchoolClass,
  Section,
  Settings,
  Staff,
  Subject,
  Template,
  TimetableSlot,
} from '../src/modules/masters/masters.model.js';

// Replace all records of one collection for this school.
// Also removes records with the same ids (left over from an older seed under another school id).
async function replace(Model, schoolId, rows) {
  const ids = rows.map((r) => r._id).filter(Boolean);
  await Model.deleteMany({ $or: [{ schoolId }, { _id: { $in: ids } }] });
  if (rows.length) await Model.insertMany(rows.map((r, i) => ({ order: i + 1, ...r, schoolId })));
  return rows.length;
}

const withId = ({ id, ...rest }) => (id ? { _id: id, ...rest } : rest);

export async function seedDemo(data, { schoolId, password }) {
  await Promise.all(
    [Department, SchoolClass, Section, Subject, Staff, TimetableSlot, Holiday, Exam, Template, Syllabus].map((m) =>
      m.syncIndexes(),
    ),
  );

  const passwordHash = await hashPassword(password);
  const counts = {
    departments: await replace(Department, schoolId, data.departments.map(withId)),
    classes: await replace(SchoolClass, schoolId, data.classes.map(withId)),
    sections: await replace(Section, schoolId, data.sections.map(withId)),
    subjects: await replace(Subject, schoolId, data.subjects.map(withId)),
    // Demo login: username = staff id (t1, t3, a1, p1 …), same password for everyone
    staff: await replace(Staff, schoolId, data.staff.map((s) => ({ ...withId(s), username: s.id, passwordHash }))),
    timetable: await replace(TimetableSlot, schoolId, data.timetable),
    holidays: await replace(Holiday, schoolId, data.holidays),
    exams: await replace(Exam, schoolId, data.exams),
    templates: await replace(Template, schoolId, data.templates.map(withId)),
    syllabus: await replace(
      Syllabus,
      schoolId,
      data.syllabus.map(({ id, chapters, ...s }) => ({
        _id: id,
        ...s,
        updatedBy: 'seed',
        chapters: chapters.map(({ id: cid, topics, ...c }) => ({
          _id: cid,
          ...c,
          topics: topics.map(({ id: tid, ...t }) => ({ _id: tid, ...t })),
        })),
      })),
    ),
  };

  await Settings.findOneAndUpdate(
    { _id: schoolId },
    { $set: { ...data.settings, bellSchedule: data.bellSchedule } },
    { upsert: true },
  );
  counts.plans = await seedDemoPlans(schoolId, data);
  return counts;
}

// The same 8 demo plans as the frontend mock (last week, this week, next week).
async function seedDemoPlans(schoolId, data) {
  await PlanItem.deleteMany({ schoolId });
  await Plan.deleteMany({ schoolId });

  const today = todayISO();
  const ws = startOfWeek(today);
  const lastWeek = [addDays(ws, -7), addDays(ws, -2)];
  const thisWeek = [ws, addDays(ws, 5)];
  const nextWeek = [addDays(ws, 7), addDays(ws, 12)];
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
  const topics = new Map(data.syllabus.flatMap((s) => s.chapters.flatMap((c) => c.topics)).map((t) => [t.id, t]));
  const periodIds = data.bellSchedule.filter((b) => b.type === 'period').map((b) => b.id);
  const order = (a, b) =>
    a.date === b.date ? periodIds.indexOf(a.periodId) - periodIds.indexOf(b.periodId) : a.date < b.date ? -1 : 1;

  const make = async (teacherId, classId, sectionId, subjectId, [startDate, endDate], status, review) => {
    const { plan } = await createPlan(schoolId, { teacherId, classId, sectionId, subjectId, startDate, endDate }, status);
    // Fill lesson details so the demo plans look real
    const items = await PlanItem.find({ planId: plan.id });
    for (const i of items) {
      if (!i.details?.objectives?.length) {
        i.details = {
          ...i.details,
          ...suggestLesson(i.topicTitle),
          prerequisites: 'Previous lesson',
          resources: [{ type: 'link', name: 'NCERT / SCERT textbook chapter', url: 'https://ncert.nic.in/textbook.php' }],
        };
        i.markModified('details');
        await i.save();
      }
    }
    const reviews = [];
    if (status === PLAN_STATUS.APPROVED) reviews.push({ by: 't3', action: 'approved', comment: 'Looks good.', at: threeDaysAgo });
    if (review) reviews.push({ by: 't3', action: 'returned', comment: review, at: new Date() });
    await Plan.updateOne(
      { _id: plan.id },
      { $set: { submittedAt: status === PLAN_STATUS.DRAFT ? null : threeDaysAgo, reviews } },
    );
    return plan;
  };

  // Mark the lessons before today as taught. One lesson can be partly done / not done.
  const markPast = async (plan, oddIndex = -1, oddStatus = LESSON_STATUS.PARTIAL) => {
    const past = (await PlanItem.find({ planId: plan.id, date: { $lt: today } })).sort(order);
    for (const [idx, i] of past.entries()) {
      const status = idx === oddIndex ? oddStatus : LESSON_STATUS.COMPLETED;
      const done = status === LESSON_STATUS.COMPLETED;
      const subtopics = topics.get(i.topicId)?.subtopics || [];
      i.status = status;
      i.completion = {
        status,
        topicsCovered: done ? subtopics : subtopics.slice(0, 1),
        objectives: (i.details.objectives || []).map((text, k) => ({ text, result: done ? 'yes' : k === 0 ? 'partly' : 'no' })),
        understanding: ['Good', 'Average', 'Needs improvement'][idx % 3 === 2 ? 1 : 0],
        remarks: done ? 'Class was attentive.' : 'Ran out of time – continue next class.',
        nextLesson: '',
        sendHomework: true,
        at: i.date,
      };
      await i.save();
    }
  };

  const { APPROVED, SUBMITTED, RETURNED } = PLAN_STATUS;
  const p1 = await make('t1', 'c8', 's8a', 'sci', lastWeek, APPROVED);
  await markPast(p1, 3);
  const p2 = await make('t1', 'c8', 's8a', 'sci', thisWeek, APPROVED);
  await markPast(p2);
  await markPast(await make('t1', 'c8', 's8b', 'sci', thisWeek, APPROVED));
  await make('t1', 'c8', 's8b', 'sci', nextWeek, SUBMITTED);
  const p5 = await make('t1', 'c7', 's7a', 'sci', nextWeek, RETURNED, 'Please add a hands-on activity for Photosynthesis (leaf starch test).');
  await markPast(await make('t2', 'c8', 's8a', 'math', thisWeek, APPROVED), 2, LESSON_STATUS.NOT_DONE);
  await make('t2', 'c8', 's8a', 'math', nextWeek, SUBMITTED);
  await markPast(await make('t2', 'c8', 's8b', 'math', thisWeek, APPROVED));

  // Lesson library: the lessons of every approved plan
  await TopicLesson.deleteMany({ schoolId });
  for (const plan of await Plan.find({ schoolId, status: APPROVED })) {
    await saveApprovedPlan(schoolId, plan.id, 't3', threeDaysAgo);
  }

  // The same bell notifications as the frontend mock
  await Notification.deleteMany({ schoolId });
  const ago = (hours) => new Date(Date.now() - hours * 3600e3);
  await Notification.insertMany(
    [
      { to: 't1', title: 'Plan sent back', text: 'Anitha Rao sent back your Class 7-A Science plan. See her comment.', link: `/lesson-planner/plans/${p5.id}`, at: ago(1) },
      { to: 't1', title: 'Plan approved', text: 'Your Class 8-A Science plan for this week was approved.', link: `/lesson-planner/plans/${p2.id}`, at: ago(24) },
      { to: 't1', title: 'Reminder', text: "Submit next week's plans by Saturday.", link: '/lesson-planner/plans', at: ago(48), read: true },
      { to: 't3', title: 'New plan to review', text: 'Priya Sharma submitted Class 8-B Science for next week.', link: '/lesson-planner/approvals', at: ago(2) },
      { to: 't3', title: 'New plan to review', text: 'Ravi Kumar submitted Class 8-A Mathematics for next week.', link: '/lesson-planner/approvals', at: ago(2.5) },
      { to: 'p1', title: 'Weekly report ready', text: 'Syllabus coverage report for last week is ready.', link: '/lesson-planner/reports', at: ago(24) },
      { to: 'a1', title: 'Syllabus missing', text: 'Class 7 Mathematics has no syllabus yet.', link: '/lesson-planner/syllabus', at: ago(24) },
    ].map((n) => ({ ...n, schoolId })),
  );
  return Plan.countDocuments({ schoolId });
}