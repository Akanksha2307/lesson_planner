// In-browser mock database. Persists to localStorage so the demo survives a refresh.
import { addDays, startOfWeek, todayISO } from '@/utils/date';
import { LESSON_STATUS, PLAN_STATUS, UNDERSTANDING } from '@/utils/constants';
import { buildCalendar, buildSyllabus, defaultSettings, templates, timetable } from './seed';
import { flatTopics, generatePlanItems, sortItems, suggestLesson } from './engine';

const KEY = 'qshikshak-lesson-planner-demo-v1';
let state = null;
let seq = 1000;
export const uid = (p) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 6)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));

export function db() {
  if (state) return state;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      state = JSON.parse(saved);
      return state;
    }
  } catch {
    /* storage unavailable – fall back to fresh seed */
  }
  state = seed();
  save();
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function reset() {
  state = seed();
  save();
}

// ---------- plan creation (shared by seed + API) ----------
// Where the lessons of a new plan would go (nothing saved) – used by create and by preview
export function planPlacement(
  s,
  { teacherId, classId, sectionId, subjectId, startDate, endDate, topicIds, topicPeriods },
) {
  const syllabus = s.syllabus.find((x) => x.classId === classId && x.subjectId === subjectId);
  if (!syllabus) throw new Error('No syllabus found for this class and subject. Ask the admin to add it first.');
  const slots = timetable.filter(
    (t) => t.sectionId === sectionId && t.subjectId === subjectId && t.teacherId === teacherId,
  );
  if (!slots.length) throw new Error('There are no timetable periods for this teacher, class and subject.');

  let topics;
  if (topicIds?.length) {
    const all = new Map(flatTopics(syllabus).map((t) => [t.id, t]));
    if (topicIds.some((id) => !all.has(id))) throw new Error('A chosen topic is not in this syllabus.');
    topics = [...new Set(topicIds)].map((id) => all.get(id));
  }

  const existing = s.items.filter((i) => i.sectionId === sectionId && i.subjectId === subjectId);
  const plannedKeys = new Set(
    existing
      .filter((i) => i.status !== LESSON_STATUS.CANCELLED && i.status !== LESSON_STATUS.RESCHEDULED)
      .map((i) => `${i.date}|${i.periodId}`),
  );
  return generatePlanItems({
    syllabus,
    topics,
    periodOverrides: topicPeriods || {},
    slots,
    startDate,
    endDate,
    holidays: s.settings.skipHolidays ? s.holidays : [],
    exams: s.settings.skipExams ? s.exams : [],
    existingItems: existing,
    alreadyPlannedKeys: plannedKeys,
  });
}

export function createPlan(s, input, status = PLAN_STATUS.DRAFT) {
  const { teacherId, classId, sectionId, subjectId, startDate, endDate, templateId } = input;
  const { placed, unscheduled, skippedDays } = planPlacement(s, input);
  if (!placed.length)
    throw new Error('Nothing to plan: all periods in these dates are already planned or are holidays.');

  const plan = {
    id: uid('plan'),
    teacherId,
    classId,
    sectionId,
    subjectId,
    startDate,
    endDate,
    templateId: templateId || s.templates.find((t) => t.isDefault)?.id,
    status,
    reviews: [],
    createdAt: new Date().toISOString(),
    submittedAt: null,
    createdBy: input.createdBy || teacherId,
    createdByRole: input.createdByRole || 'teacher',
    note: input.note || undefined,
  };
  s.plans.push(plan);
  placed.forEach(({ date, periodId, topic }) => {
    // Pre-fill from the latest lesson on the same topic (lesson library)
    const prev = [...s.items].reverse().find((i) => i.topicId === topic.id && i.details?.objectives?.length);
    s.items.push({
      id: uid('item'),
      planId: plan.id,
      teacherId,
      classId,
      sectionId,
      subjectId,
      date,
      periodId,
      topicId: topic.id,
      topicTitle: topic.title,
      chapterId: topic.chapterId,
      chapterTitle: topic.chapterTitle,
      status: LESSON_STATUS.PLANNED,
      details: prev ? { ...clone(prev.details), prefilledFrom: prev.id } : emptyDetails(),
      completion: null,
      history: [{ at: new Date().toISOString(), action: 'created' }],
    });
  });
  return { plan, unscheduled, skippedDays, placedCount: placed.length };
}

export const emptyDetails = () => ({
  objectives: [],
  prerequisites: '',
  method: '',
  activities: '',
  resources: [],
  assessment: '',
  homework: '',
  timePlan: [],
});

// ---------- seed ----------
function seed() {
  const { holidays, exams } = buildCalendar();
  const s = {
    syllabus: buildSyllabus(),
    holidays,
    exams,
    templates: clone(templates),
    settings: { ...defaultSettings },
    plans: [],
    items: [],
    notifications: [],
  };
  const today = todayISO();
  const ws = startOfWeek(today);
  const lastWeek = [addDays(ws, -7), addDays(ws, -2)];
  const thisWeek = [ws, addDays(ws, 5)];
  const nextWeek = [addDays(ws, 7), addDays(ws, 12)];

  const make = (teacherId, classId, sectionId, subjectId, [start, end], status) => {
    const { plan } = createPlan(
      s,
      { teacherId, classId, sectionId, subjectId, startDate: start, endDate: end },
      status,
    );
    // fill details so seeded plans look real
    s.items
      .filter((i) => i.planId === plan.id)
      .forEach((i) => {
        if (!i.details.objectives.length) {
          const sug = suggestLesson(i.topicTitle);
          i.details = {
            ...emptyDetails(),
            ...sug,
            prerequisites: 'Previous lesson',
            resources: [
              { type: 'link', name: 'NCERT / SCERT textbook chapter', url: 'https://ncert.nic.in/textbook.php' },
            ],
          };
        }
      });
    if (status !== PLAN_STATUS.DRAFT) plan.submittedAt = new Date(Date.now() - 86400000 * 3).toISOString();
    if (status === PLAN_STATUS.APPROVED)
      plan.reviews.push({ id: uid('rev'), by: 't3', action: 'approved', comment: 'Looks good.', at: plan.submittedAt });
    return plan;
  };
  const markPast = (plan, oddIndex = -1, oddStatus = LESSON_STATUS.PARTIAL) => {
    s.items
      .filter((i) => i.planId === plan.id && i.date < today)
      .sort(sortItems)
      .forEach((i, idx) => {
        const status = idx === oddIndex ? oddStatus : LESSON_STATUS.COMPLETED;
        const syl = s.syllabus.find((x) => x.classId === i.classId && x.subjectId === i.subjectId);
        const topic = syl.chapters.flatMap((c) => c.topics).find((t) => t.id === i.topicId);
        i.status = status;
        i.completion = {
          status,
          topicsCovered: status === LESSON_STATUS.COMPLETED ? topic.subtopics : topic.subtopics.slice(0, 1),
          objectives: (i.details.objectives || []).map((text, k) => ({
            text,
            result: status === LESSON_STATUS.COMPLETED ? 'yes' : k === 0 ? 'partly' : 'no',
          })),
          understanding: UNDERSTANDING[idx % 3 === 2 ? 1 : 0],
          remarks:
            status === LESSON_STATUS.COMPLETED ? 'Class was attentive.' : 'Ran out of time – continue next class.',
          nextLesson: '',
          sendHomework: true,
          at: i.date,
        };
      });
  };

  const p1 = make('t1', 'c8', 's8a', 'sci', lastWeek, PLAN_STATUS.APPROVED);
  markPast(p1, 3);
  const p2 = make('t1', 'c8', 's8a', 'sci', thisWeek, PLAN_STATUS.APPROVED);
  markPast(p2);
  const p3 = make('t1', 'c8', 's8b', 'sci', thisWeek, PLAN_STATUS.APPROVED);
  markPast(p3);
  make('t1', 'c8', 's8b', 'sci', nextWeek, PLAN_STATUS.SUBMITTED);
  const p5 = make('t1', 'c7', 's7a', 'sci', nextWeek, PLAN_STATUS.RETURNED);
  p5.reviews.push({
    id: uid('rev'),
    by: 't3',
    action: 'returned',
    comment: 'Please add a hands-on activity for Photosynthesis (leaf starch test).',
    at: new Date().toISOString(),
  });
  const p6 = make('t2', 'c8', 's8a', 'math', thisWeek, PLAN_STATUS.APPROVED);
  markPast(p6, 2, LESSON_STATUS.NOT_DONE);
  make('t2', 'c8', 's8a', 'math', nextWeek, PLAN_STATUS.SUBMITTED);
  const p8 = make('t2', 'c8', 's8b', 'math', thisWeek, PLAN_STATUS.APPROVED);
  markPast(p8);

  const now = Date.now();
  s.notifications = [
    {
      id: uid('n'),
      to: 't1',
      title: 'Plan sent back',
      text: 'Anitha Rao sent back your Class 7-A Science plan. See her comment.',
      link: `/lesson-planner/plans/${p5.id}`,
      at: new Date(now - 3600e3).toISOString(),
      read: false,
    },
    {
      id: uid('n'),
      to: 't1',
      title: 'Plan approved',
      text: 'Your Class 8-A Science plan for this week was approved.',
      link: `/lesson-planner/plans/${p2.id}`,
      at: new Date(now - 86400e3).toISOString(),
      read: false,
    },
    {
      id: uid('n'),
      to: 't1',
      title: 'Reminder',
      text: "Submit next week's plans by Saturday.",
      link: '/lesson-planner/plans',
      at: new Date(now - 2 * 86400e3).toISOString(),
      read: true,
    },
    {
      id: uid('n'),
      to: 't3',
      title: 'New plan to review',
      text: 'Priya Sharma submitted Class 8-B Science for next week.',
      link: '/lesson-planner/approvals',
      at: new Date(now - 7200e3).toISOString(),
      read: false,
    },
    {
      id: uid('n'),
      to: 't3',
      title: 'New plan to review',
      text: 'Ravi Kumar submitted Class 8-A Mathematics for next week.',
      link: '/lesson-planner/approvals',
      at: new Date(now - 9000e3).toISOString(),
      read: false,
    },
    {
      id: uid('n'),
      to: 'p1',
      title: 'Weekly report ready',
      text: 'Syllabus coverage report for last week is ready.',
      link: '/lesson-planner/reports',
      at: new Date(now - 86400e3).toISOString(),
      read: false,
    },
    {
      id: uid('n'),
      to: 'a1',
      title: 'Syllabus missing',
      text: 'Class 7 Mathematics has no syllabus yet.',
      link: '/lesson-planner/syllabus',
      at: new Date(now - 86400e3).toISOString(),
      read: false,
    },
  ];
  return s;
}