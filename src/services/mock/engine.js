// Core planning logic. The backend's scheduler.service.js should implement
// exactly the same rules – this copy lets the frontend run without a server.
import { addDays, weekdayIndex } from '@/utils/date';
import { LESSON_STATUS, PERIODS } from '@/utils/constants';

const periodOrder = (id) => PERIODS.findIndex((p) => p.id === id);
export const sortItems = (a, b) =>
  a.date === b.date ? periodOrder(a.periodId) - periodOrder(b.periodId) : a.date < b.date ? -1 : 1;

// Flatten syllabus into ordered topics with chapter info
export function flatTopics(syllabus) {
  return syllabus.chapters.flatMap((ch) =>
    ch.topics.map((tp) => ({
      ...tp,
      chapterId: tp.chapterId || ch.id,
      chapterTitle: ch.title,
      chapterStart: ch.startDate || undefined,
      chapterEnd: ch.endDate || undefined,
    })),
  );
}

// How many periods of each topic are already taught for this section + subject
export function taughtPeriods(items) {
  const map = {};
  items.forEach((it) => {
    if (it.status === LESSON_STATUS.COMPLETED) map[it.topicId] = (map[it.topicId] || 0) + 1;
    if (it.status === LESSON_STATUS.PARTIAL) map[it.topicId] = (map[it.topicId] || 0) + 0.5;
  });
  return map;
}

/**
 * Auto-fill: place remaining topics into the teacher's timetable periods.
 * Skips Sundays, holidays and exam days. Periods already planned are left alone.
 * A chapter with From / To dates is only placed inside them; chapters without dates fill the free
 * periods in order. `topics` (admin's choice for one plan) replaces the syllabus order;
 * `periodOverrides` changes periods per topic for this plan only. Same rules as lesson-plan-service.
 */
export function generatePlanItems({
  syllabus,
  topics,
  periodOverrides = {},
  slots,
  startDate,
  endDate,
  holidays,
  exams,
  existingItems,
  alreadyPlannedKeys,
}) {
  const taught = taughtPeriods(existingItems);
  const queue = [];
  (topics ?? flatTopics(syllabus)).forEach((tp) => {
    const periods = periodOverrides[tp.id] ?? tp.estPeriods;
    const remaining = Math.max(0, Math.ceil(periods - (taught[tp.id] || 0)));
    for (let i = 0; i < remaining; i++) queue.push(tp);
  });
  // remove periods already planned in future (other plans) so we continue after them
  const futurePlanned = existingItems.filter((it) => it.status === LESSON_STATUS.PLANNED);
  futurePlanned.forEach((it) => {
    const idx = queue.findIndex((q) => q.id === it.topicId);
    if (idx > -1) queue.splice(idx, 1);
  });
  const neededPeriods = queue.length;

  const skip = new Set([...holidays.map((h) => h.date), ...exams.map((e) => e.date)]);
  const placed = [];
  const skippedDays = [];
  const missed = [];
  let freeSlots = 0;
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const wd = weekdayIndex(d);
    if (wd === 6) continue;
    const daySlots = slots
      .filter((s) => s.weekday === wd)
      .sort((a, b) => periodOrder(a.periodId) - periodOrder(b.periodId));
    if (!daySlots.length) continue;
    if (skip.has(d)) {
      skippedDays.push(d);
      continue;
    }
    for (const s of daySlots) {
      if (alreadyPlannedKeys?.has(`${d}|${s.periodId}`)) continue;
      freeSlots++;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].chapterEnd && d > queue[i].chapterEnd) missed.push(...queue.splice(i, 1));
      }
      const idx = queue.findIndex((q) => !q.chapterStart || d >= q.chapterStart);
      if (idx === -1) continue;
      const [tp] = queue.splice(idx, 1);
      placed.push({ date: d, periodId: s.periodId, topic: tp });
    }
  }
  const reasonFor = (q) =>
    q.chapterStart && q.chapterStart > endDate
      ? `The chapter starts on ${q.chapterStart}, after this plan ends.`
      : missed.includes(q) || (q.chapterEnd && q.chapterEnd < endDate)
        ? `The chapter's dates end on ${q.chapterEnd}; there were not enough free periods before that.`
        : 'Not enough free periods before the end date.';
  const unscheduled = [...new Map([...missed, ...queue].map((q) => [q.id, { ...q, reason: reasonFor(q) }])).values()];
  return { placed, unscheduled, skippedDays, freeSlots, neededPeriods };
}

/** Chapter-wise coverage for one section + subject */
export function coverage(syllabus, items) {
  const taught = taughtPeriods(items);
  let doneAll = 0;
  let totalAll = 0;
  const chapters = syllabus.chapters.map((ch) => {
    let done = 0;
    let total = 0;
    ch.topics.forEach((tp) => {
      total += tp.estPeriods;
      done += Math.min(tp.estPeriods, taught[tp.id] || 0);
    });
    doneAll += done;
    totalAll += total;
    return {
      id: ch.id,
      title: ch.title,
      term: ch.term,
      percent: total ? Math.round((done / total) * 100) : 0,
      topics: ch.topics.length,
    };
  });
  return { chapters, overall: totalAll ? Math.round((doneAll / totalAll) * 100) : 0 };
}

/** Mock "AI" suggestion – the backend will call an LLM here */
export function suggestLesson(topicTitle, minutes = 40) {
  const blocks = [
    ['Introduction', 0.125, '#6a60cc'],
    ['Explanation', 0.375, '#4b44b5'],
    ['Demonstration', 0.2, '#3b82f6'],
    ['Activity', 0.2, '#16a34a'],
    ['Assessment', 0.1, '#f59e0b'],
  ];
  return {
    objectives: [
      `Explain what ${topicTitle.toLowerCase()} means in their own words`,
      `Identify examples of ${topicTitle.toLowerCase()} in daily life`,
      `Solve simple questions on ${topicTitle.toLowerCase()}`,
    ],
    method: 'Demonstration',
    activities: `Start with a real-life question to connect to ${topicTitle.toLowerCase()}. Explain the key idea on the board, show a short demonstration, then students work in pairs on a quick activity and share answers.`,
    assessment: 'Three quick oral questions and a one-line exit ticket.',
    homework: `Write 5 examples of ${topicTitle.toLowerCase()} from your home or school.`,
    timePlan: blocks.map(([label, share, color]) => ({ label, min: Math.round(minutes * share), color })),
  };
}