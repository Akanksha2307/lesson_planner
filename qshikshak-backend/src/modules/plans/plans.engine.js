import { addDays, weekdayIndex } from '../../common/dates.js';
import { LESSON_STATUS } from './plans.model.js';

// Sort lessons by date, then by period order in the bell schedule
export const byDateAndPeriod = (periodIds) => (a, b) =>
  a.date === b.date ? periodIds.indexOf(a.periodId) - periodIds.indexOf(b.periodId) : a.date < b.date ? -1 : 1;

// Syllabus → one ordered list of topics, each with its chapter
export const flatTopics = (syllabus) =>
  syllabus.chapters.flatMap((ch) =>
    ch.topics.map((tp) => ({ ...tp, id: tp.id ?? tp._id, chapterId: ch.id ?? ch._id, chapterTitle: ch.title })),
  );

// How many periods of each topic are already taught (partly done counts as half)
export function taughtPeriods(items) {
  const map = {};
  items.forEach((it) => {
    if (it.status === LESSON_STATUS.COMPLETED) map[it.topicId] = (map[it.topicId] || 0) + 1;
    if (it.status === LESSON_STATUS.PARTIAL) map[it.topicId] = (map[it.topicId] || 0) + 0.5;
  });
  return map;
}

/**
 * Put the syllabus topics that are still left into the teacher's timetable periods.
 * - Each topic needs estPeriods periods (minus what was already taught).
 * - Topics already planned in another plan are not planned again.
 * - Sundays are skipped. Holidays and exam days are skipped and reported.
 * - Periods that already have a lesson are left alone.
 */
export function generatePlanItems({ syllabus, slots, startDate, endDate, blockedDates, existingItems, plannedKeys, periodIds }) {
  const taught = taughtPeriods(existingItems);
  const queue = [];
  flatTopics(syllabus).forEach((tp) => {
    const remaining = Math.max(0, Math.ceil(tp.estPeriods - (taught[tp.id] || 0)));
    for (let i = 0; i < remaining; i++) queue.push(tp);
  });
  // Already planned (not yet taught) in another plan → continue after them
  existingItems
    .filter((it) => it.status === LESSON_STATUS.PLANNED)
    .forEach((it) => {
      const idx = queue.findIndex((q) => q.id === it.topicId);
      if (idx > -1) queue.splice(idx, 1);
    });

  const placed = [];
  const skippedDays = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const wd = weekdayIndex(d);
    if (wd === 6) continue; // Sunday
    const daySlots = slots
      .filter((s) => s.weekday === wd)
      .sort((a, b) => periodIds.indexOf(a.periodId) - periodIds.indexOf(b.periodId));
    if (!daySlots.length) continue;
    if (blockedDates.has(d)) {
      skippedDays.push(d);
      continue;
    }
    for (const s of daySlots) {
      if (plannedKeys.has(`${d}|${s.periodId}`)) continue;
      const tp = queue.shift();
      if (!tp) break;
      placed.push({ date: d, periodId: s.periodId, topic: tp });
    }
  }
  // Topics that did not fit in these dates (each listed once)
  const unscheduled = [
    ...new Map(queue.map((q) => [q.id, { id: q.id, title: q.title, chapterTitle: q.chapterTitle }])).values(),
  ];
  return { placed, unscheduled, skippedDays };
}

// Sample lesson details – used for the demo data (an AI call can replace this later)
export function suggestLesson(topicTitle, minutes = 40) {
  const t = topicTitle.toLowerCase();
  const blocks = [
    ['Introduction', 0.125, '#6a60cc'],
    ['Explanation', 0.375, '#4b44b5'],
    ['Demonstration', 0.2, '#3b82f6'],
    ['Activity', 0.2, '#16a34a'],
    ['Assessment', 0.1, '#f59e0b'],
  ];
  return {
    objectives: [
      `Explain what ${t} means in their own words`,
      `Identify examples of ${t} in daily life`,
      `Solve simple questions on ${t}`,
    ],
    method: 'Demonstration',
    activities: `Start with a real-life question to connect to ${t}. Explain the key idea on the board, show a short demonstration, then students work in pairs on a quick activity and share answers.`,
    assessment: 'Three quick oral questions and a one-line exit ticket.',
    homework: `Write 5 examples of ${t} from your home or school.`,
    timePlan: blocks.map(([label, share, color]) => ({ label, min: Math.round(minutes * share), color })),
  };
}