// Lesson scheduling rules: continue an unfinished topic, undo a continuation.
// Used by lessons.js (marking, drag & drop). Not called from the UI directly.
import { addDays, todayISO, weekdayIndex } from '@/utils/date';
import { LESSON_STATUS, periodById } from '@/utils/constants';
import { periodHasStarted, periodKind } from '@/utils/freePeriods';
import { staff, timetable } from '../seed';
import { sortItems } from '../engine';
import { uid } from '../mockDb';
import { byId, sectionLabel, notify, pickContent, isLive, periodIndex, isBlockedDay } from './helpers';

// Next period of this class + subject after the lesson (empty, or holding a planned lesson)
export function nextClassPeriod(s, it) {
  const mySlots = timetable.filter(
    (t) => t.sectionId === it.sectionId && t.subjectId === it.subjectId && t.teacherId === it.teacherId,
  );
  const today = todayISO();
  for (let d = it.date, n = 0; n < 120; d = addDays(d, 1), n++) {
    if (d < today || isBlockedDay(s, d)) continue;
    const daySlots = mySlots
      .filter((t) => t.weekday === weekdayIndex(d))
      .sort((a, b) => periodIndex(a.periodId) - periodIndex(b.periodId));
    for (const t of daySlots) {
      const cand = { date: d, periodId: t.periodId };
      if (sortItems(cand, it) <= 0 || periodHasStarted(d, t.periodId)) continue;
      const inCell = s.items.filter(
        (x) => x.sectionId === it.sectionId && x.date === d && x.periodId === t.periodId && isLive(x),
      );
      if (
        !inCell.length ||
        (inCell.length === 1 && inCell[0].status === LESSON_STATUS.PLANNED && inCell[0].subjectId === it.subjectId)
      )
        return cand;
    }
  }
  return null;
}

export function continueCore(s, it, { date, periodId }) {
  if (![LESSON_STATUS.PARTIAL, LESSON_STATUS.NOT_DONE].includes(it.status))
    throw new Error('Only a partly done or not done lesson can be continued.');
  if (sortItems({ date, periodId }, it) <= 0)
    throw new Error('Drop the lesson on a period after the one it was taught in.');
  if (periodHasStarted(date, periodId))
    throw new Error('That period has already started or is over. Choose a later period.');
  if (s.holidays.some((h) => h.date === date)) throw new Error('That date is a school holiday.');
  if (s.exams.some((e) => e.date === date)) throw new Error('That date is an exam day.');
  if (!periodKind(timetable, it, date, periodId))
    throw new Error(
      `That period is not free for ${sectionLabel(it.sectionId)} and ${byId(staff, it.teacherId)?.name}.`,
    );

  const group = s.items
    .filter(
      (x) =>
        x.sectionId === it.sectionId &&
        x.subjectId === it.subjectId &&
        x.status === LESSON_STATUS.PLANNED &&
        sortItems(x, it) > 0,
    )
    .sort(sortItems);
  const oldCopy = group.find((x) => x.continuationOf === it.id);
  if (oldCopy && oldCopy.date === date && oldCopy.periodId === periodId)
    throw new Error('This lesson already continues in that period.');

  const slots = [...group];
  let targetItem = group.find((x) => x.date === date && x.periodId === periodId);
  if (!targetItem) {
    const busy = s.items.find(
      (x) =>
        x.date === date &&
        x.periodId === periodId &&
        isLive(x) &&
        (x.sectionId === it.sectionId || x.teacherId === it.teacherId),
    );
    if (busy) throw new Error(`That period already has “${busy.topicTitle}” (${sectionLabel(busy.sectionId)}).`);
    targetItem = { __new: true, date, periodId };
    slots.push(targetItem);
    slots.sort(sortItems);
  }

  const contents = group.filter((x) => x !== oldCopy).map(pickContent);
  contents.splice(slots.indexOf(targetItem), 0, { ...pickContent(it), continued: true, continuationOf: it.id });

  // One lesson too many -> next free period of this class after the last one
  if (contents.length > slots.length) {
    const mySlots = timetable.filter(
      (t) => t.sectionId === it.sectionId && t.subjectId === it.subjectId && t.teacherId === it.teacherId,
    );
    const last = slots[slots.length - 1];
    let found = null;
    for (let d = last.date, n = 0; !found && n < 120; d = addDays(d, 1), n++) {
      if (isBlockedDay(s, d)) continue;
      const daySlots = mySlots
        .filter((t) => t.weekday === weekdayIndex(d))
        .sort((a, b) => periodIndex(a.periodId) - periodIndex(b.periodId));
      for (const t of daySlots) {
        const cand = { date: d, periodId: t.periodId };
        if (sortItems(cand, last) <= 0) continue;
        if (s.items.some((x) => x.sectionId === it.sectionId && x.date === d && x.periodId === t.periodId && isLive(x)))
          continue;
        found = cand;
        break;
      }
    }
    if (!found) throw new Error('No free period found in the next few months to fit the last lesson.');
    slots.push({ __new: true, ...found });
  }

  const now = new Date().toISOString();
  const planFor = (d) =>
    s.plans.find(
      (p) => p.sectionId === it.sectionId && p.subjectId === it.subjectId && p.startDate <= d && p.endDate >= d,
    ) ||
    byId(s.plans, slots.filter((x) => !x.__new && x.date <= d).pop()?.planId) ||
    byId(s.plans, it.planId);

  const changed = [];
  slots.forEach((slot, i) => {
    const content = contents[i];
    const label = content?.continuationOf === it.id ? 'continued here' : 'shifted after a lesson was continued';
    if (slot.__new) {
      if (!content) return;
      const plan = planFor(slot.date);
      if (slot.date > plan.endDate) plan.endDate = slot.date;
      const created = {
        id: uid('item'),
        planId: plan.id,
        teacherId: it.teacherId,
        classId: it.classId,
        sectionId: it.sectionId,
        subjectId: it.subjectId,
        date: slot.date,
        periodId: slot.periodId,
        status: LESSON_STATUS.PLANNED,
        completion: null,
        ...content,
        history: [{ at: now, action: label }],
      };
      s.items.push(created);
      changed.push(created);
      return;
    }
    if (!content) {
      s.items = s.items.filter((x) => x.id !== slot.id);
      return;
    } // period no longer needed
    if (slot.topicId !== content.topicId || slot.continuationOf !== content.continuationOf) {
      Object.assign(slot, content);
      slot.history.push({ at: now, action: label });
      changed.push(slot);
    }
  });

  it.history.push({ at: now, action: `continues on ${date} (${periodById(periodId)?.label})` });
  const later = Math.max(0, changed.length - 1);
  notify(
    it.teacherId,
    'Lesson continued',
    `“${it.topicTitle}” (${sectionLabel(it.sectionId)}) continues on ${date}, ${periodById(periodId)?.label}.${later ? ` ${later} later lesson${later === 1 ? '' : 's'} moved forward.` : ''}`,
    `/lesson-planner/plans/${it.planId}`,
  );
  return { changed };
}

// Undo a continuation: remove the carried copy and move later lessons back by one period
export function removeContinuation(s, it) {
  const group = s.items
    .filter(
      (x) =>
        x.sectionId === it.sectionId &&
        x.subjectId === it.subjectId &&
        x.status === LESSON_STATUS.PLANNED &&
        sortItems(x, it) > 0,
    )
    .sort(sortItems);
  const copy = group.find((x) => x.continuationOf === it.id);
  if (!copy) return 0;
  const contents = group.filter((x) => x !== copy).map(pickContent);
  const now = new Date().toISOString();
  let moved = 0;
  group.forEach((slot, i) => {
    const content = contents[i];
    if (!content) {
      s.items = s.items.filter((x) => x.id !== slot.id);
      return;
    } // last period is free again
    if (slot.topicId !== content.topicId || slot.continuationOf !== content.continuationOf) {
      Object.assign(slot, content);
      slot.history.push({ at: now, action: 'moved back – earlier lesson was completed' });
      moved++;
    }
  });
  notify(
    it.teacherId,
    'Plan updated',
    `“${it.topicTitle}” is now marked done, so its extra period was removed and ${moved} lesson${moved === 1 ? '' : 's'} moved back.`,
    `/lesson-planner/plans/${it.planId}`,
  );
  return moved;
}
