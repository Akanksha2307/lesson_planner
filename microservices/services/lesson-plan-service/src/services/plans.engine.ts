import { addDays, weekdayIndex } from "../utils/dates";
import { LESSON_STATUS } from "../models/plans.model";

// Sort lessons by date, then by period order in the bell schedule
export const byDateAndPeriod = (periodIds: any) => (a: any, b: any) =>
  a.date === b.date ? periodIds.indexOf(a.periodId) - periodIds.indexOf(b.periodId) : a.date < b.date ? -1 : 1;

// Syllabus → one ordered list of topics, each with its chapter
export const flatTopics = (syllabus: any) =>
  syllabus.chapters.flatMap((ch: any) =>
    ch.topics.map((tp: any) => ({
      ...tp,
      id: tp.id ?? tp._id,
      chapterId: ch.id ?? ch._id,
      chapterTitle: ch.title,
      chapterStart: ch.startDate || undefined,
      chapterEnd: ch.endDate || undefined,
    })),
  );

// How many periods of each topic are already taught (partly done counts as half)
export function taughtPeriods(items: any) {
  const map: Record<string, number> = {};
  items.forEach((it: any) => {
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
 * - A chapter with From / To dates is only placed inside those dates. Chapters without dates
 *   fill the free periods in syllabus order.
 * - `topics` (optional) replaces the syllabus order: only these topics, in this order
 *   (the admin's choice for one plan). `periodOverrides` changes estPeriods for this plan only.
 */
export function generatePlanItems({
  syllabus,
  topics,
  periodOverrides = {},
  slots,
  startDate,
  endDate,
  blockedDates,
  existingItems,
  plannedKeys,
  periodIds,
}: {
  syllabus: any;
  topics?: any[];
  periodOverrides?: Record<string, number>;
  slots: any[];
  startDate: string;
  endDate: string;
  blockedDates: Set<string>;
  existingItems: any[];
  plannedKeys: Set<string>;
  periodIds: string[];
}) {
  const taught = taughtPeriods(existingItems);
  const queue: any[] = [];
  (topics ?? flatTopics(syllabus)).forEach((tp: any) => {
    const periods = periodOverrides[tp.id] ?? tp.estPeriods;
    const remaining = Math.max(0, Math.ceil(periods - (taught[tp.id] || 0)));
    for (let i = 0; i < remaining; i++) queue.push(tp);
  });
  // Already planned (not yet taught) in another plan → continue after them
  existingItems
    .filter((it: any) => it.status === LESSON_STATUS.PLANNED)
    .forEach((it: any) => {
      const idx = queue.findIndex((q) => q.id === it.topicId);
      if (idx > -1) queue.splice(idx, 1);
    });
  const neededPeriods = queue.length;

  const placed = [];
  const skippedDays = [];
  const missed: any[] = []; // their chapter's To date passed before a free period came
  let freeSlots = 0;
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const wd = weekdayIndex(d);
    if (wd === 6) continue; // Sunday
    const daySlots = slots
      .filter((s: any) => s.weekday === wd)
      .sort((a: any, b: any) => periodIds.indexOf(a.periodId) - periodIds.indexOf(b.periodId));
    if (!daySlots.length) continue;
    if (blockedDates.has(d)) {
      skippedDays.push(d);
      continue;
    }
    for (const s of daySlots) {
      if (plannedKeys.has(`${d}|${s.periodId}`)) continue;
      freeSlots++;
      // Topics whose chapter window has closed cannot be placed any more
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].chapterEnd && d > queue[i].chapterEnd) missed.push(...queue.splice(i, 1));
      }
      // The first topic (in order) whose chapter window is open on this day
      const idx = queue.findIndex((q) => !q.chapterStart || d >= q.chapterStart);
      if (idx === -1) continue;
      const [tp] = queue.splice(idx, 1);
      placed.push({ date: d, periodId: s.periodId, topic: tp });
    }
  }

  // Topics that did not fit in these dates (each listed once), with the reason
  const reasonFor = (q: any) =>
    q.chapterStart && q.chapterStart > endDate
      ? `The chapter starts on ${q.chapterStart}, after this plan ends.`
      : missed.includes(q) || (q.chapterEnd && q.chapterEnd < endDate)
        ? `The chapter's dates end on ${q.chapterEnd}; there were not enough free periods before that.`
        : 'Not enough free periods before the end date.';
  const unscheduled = [
    ...new Map(
      [...missed, ...queue].map((q) => [
        q.id,
        { id: q.id, title: q.title, chapterTitle: q.chapterTitle, reason: reasonFor(q) },
      ]),
    ).values(),
  ];
  return { placed, unscheduled, skippedDays, freeSlots, neededPeriods };
}

// Sample lesson details – used for the demo data (an AI call can replace this later)
export function suggestLesson(topicTitle: any, minutes = 40) {
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
    timePlan: blocks.map(([label, share, color]) => ({ label, min: Math.round(minutes * (share as number)), color })),
  };
}