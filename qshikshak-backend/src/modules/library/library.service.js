// When a plan is approved, its lessons (with objectives) are saved to the library against their topic.
import { TopicLesson } from './library.model.js';
import { PlanItem, LESSON_STATUS } from '../plans/plans.model.js';
import { loadSchool, enrich } from '../plans/plans.service.js';
import { subscribe } from '../../common/events.js';

const KEEP = [LESSON_STATUS.PLANNED, LESSON_STATUS.COMPLETED, LESSON_STATUS.PARTIAL];
const FIELDS = ['topicId', 'topicTitle', 'chapterId', 'chapterTitle', 'classId', 'sectionId', 'subjectId', 'teacherId', 'planId', 'date', 'periodId', 'status', 'details'];

// Copy an approved plan's lessons into the library (again = update, never duplicates)
export async function saveApprovedPlan(schoolId, planId, approvedBy, approvedAt = new Date()) {
  const items = await PlanItem.find({ schoolId, planId, status: { $in: KEEP }, 'details.objectives.0': { $exists: true } }).lean();
  for (const item of items) {
    const copy = Object.fromEntries(FIELDS.map((k) => [k, item[k]]));
    await TopicLesson.updateOne(
      { _id: item._id },
      { $set: { ...copy, schoolId, approvedBy, approvedAt } },
      { upsert: true },
    );
  }
  return items.length;
}

// GET /library?q=&subjectId=&topicId=   – newest lesson per topic + teacher (same as the mock)
export async function listLibrary(ctx, { q, subjectId, topicId }) {
  const filter = { schoolId: ctx.schoolId };
  if (subjectId) filter.subjectId = subjectId;
  if (topicId) filter.topicId = topicId;
  let rows = await TopicLesson.find(filter).sort({ approvedAt: -1 }).lean();
  if (q) {
    const k = q.toLowerCase();
    rows = rows.filter((r) => `${r.topicTitle} ${r.chapterTitle}`.toLowerCase().includes(k));
  }
  // rows are newest first → keep the first one seen for each topic + teacher
  const newest = new Map();
  rows.forEach((r) => {
    const key = `${r.topicId}|${r.teacherId}`;
    if (!newest.has(key)) newest.set(key, r);
  });
  const sch = await loadSchool(ctx.schoolId);
  return [...newest.values()].map(({ _id, ...r }) => enrich({ id: _id, ...r }, sch, 'approved'));
}

// Listen: plan approved → save its lessons
subscribe('plan.reviewed', ({ schoolId, planId, action, reviewerId }) =>
  action === 'approved' ? saveApprovedPlan(schoolId, planId, reviewerId) : null,
);
