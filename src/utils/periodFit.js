// How many timetable periods a class + subject really has between two dates.
// Used on the Syllabus page to warn the admin when a chapter does not fit in its From – To dates.
import { addDays, weekdayIndex } from './date';

// Dates nobody teaches on: holidays and exam days (an exam may span several days)
export function blockedDates(holidays = [], exams = []) {
  const set = new Set(holidays.map((h) => h.date));
  exams.forEach((e) => {
    const first = e.startDate || e.date;
    const last = e.endDate || first;
    if (!first) return;
    for (let d = first; d <= last; d = addDays(d, 1)) set.add(d);
  });
  return set;
}

// { [sectionId]: periods } between from and to (both included), Sundays skipped
export function periodsInWindow({ timetable, sectionIds, subjectId, from, to, blocked }) {
  const out = {};
  sectionIds.forEach((id) => (out[id] = 0));
  if (!from || !to || to < from) return out;
  const rows = timetable.filter((t) => t.subjectId === subjectId && sectionIds.includes(t.sectionId));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayIndex(d);
    if (wd === 6 || blocked.has(d)) continue;
    rows.filter((t) => t.weekday === wd).forEach((t) => (out[t.sectionId] += 1));
  }
  return out;
}

// The chip next to a chapter: does it fit in every section that studies it?
// → null (no dates / nobody teaches it) or { ok, text }
export function chapterFit({ chapter, sections, timetable, subjectId, blocked, sectionLabel }) {
  if (!chapter.startDate || !chapter.endDate) return null;
  const needed = chapter.topics.reduce((a, t) => a + Number(t.estPeriods || 0), 0);
  const taught = sections.filter((s) => timetable.some((t) => t.sectionId === s.id && t.subjectId === subjectId));
  if (!taught.length) return null;
  const free = periodsInWindow({
    timetable,
    sectionIds: taught.map((s) => s.id),
    subjectId,
    from: chapter.startDate,
    to: chapter.endDate,
    blocked,
  });
  const [worstId, worst] = Object.entries(free).sort((a, b) => a[1] - b[1])[0];
  if (worst >= needed) return { ok: true, text: `fits · ${worst} periods free` };
  return { ok: false, text: `needs ${needed} · only ${worst} free in ${sectionLabel(worstId)}` };
}