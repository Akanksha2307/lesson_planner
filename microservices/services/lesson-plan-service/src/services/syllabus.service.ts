import { RequestContext, AuthUser } from "../types";
import { Syllabus } from '../models/syllabus.model';

import { PlanItem } from '../models/plans.model';

import { newId } from '../utils/ids';

import {
  badRequest,
  conflict,
  notFound
} from '../utils/AppError';

const key = (s: any) => String(s || '').trim().toLowerCase();
// A date cell from Excel → "YYYY-MM-DD", or undefined when empty / not a date.
// Accepts 2026-08-01, 01-08-2026, 01/08/2026 (day first) and Excel's day numbers (46235).
export function excelDate(value: any): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return iso(value);
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    return iso(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000));
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return undefined;
}

// Adds order numbers and defaults. Existing topics keep their id, source and addedBy.
function normalise(chapters: any, previous: any, user: AuthUser) {
  const oldTopics = new Map();
  previous?.chapters.forEach((c: any) => c.topics.forEach((t: any) => oldTopics.set(t._id, t)));
  const seenIds = new Set();
  const freshId = (id: any, prefix: any) => {
    const ok = id && !seenIds.has(id);
    const finalId = ok ? id : newId(prefix);
    seenIds.add(finalId);
    return finalId;
  };

  return chapters.map((c: any, ci: any) => {
    const chapterId = freshId(c.id, 'ch');
    return {
      _id: chapterId,
      title: c.title,
      term: c.term || 'Term 1',
      order: ci + 1,
      startDate: c.startDate || undefined,
      endDate: c.endDate || undefined,
      topics: c.topics.map((t: any, ti: any) => {
        const old = t.id ? oldTopics.get(t.id) : null;
        const topicId = freshId(old ? t.id : null, 'tp');
        return {
          _id: topicId,
          chapterId,
          title: t.title,
          order: ti + 1,
          estPeriods: t.estPeriods || 1,
          subtopics: t.subtopics?.length ? t.subtopics : [t.title],
          source: old?.source || 'syllabus',
          addedBy: old?.addedBy || (old ? undefined : user?.id),
          addedAt: old?.addedAt || (old ? undefined : new Date()),
        };
      }),
    };
  });
}
// A topic that lesson plans already use cannot be removed (the lessons would point at nothing).
async function assertUsedTopicsKept(existing: any, chapters: any) {
  const keep = new Set(chapters.flatMap((c: any) => c.topics.map((t: any) => t._id)));
  const removed = existing.chapters.flatMap((c: any) => c.topics).filter((t: any) => !keep.has(t._id));
  if (!removed.length) return;
  const used = await PlanItem.find(
    { schoolId: existing.schoolId, topicId: { $in: removed.map((t: any) => t._id) } },
    { topicId: 1 },
  ).lean();
  const usedIds = new Set(used.map((u) => u.topicId));
  const names = removed.filter((t: any) => usedIds.has(t._id)).map((t: any) => `"${t.title}"`);
  if (names.length) {
    throw conflict(
      `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and others' : ''} already used in lesson plans, so cannot be removed. Rename the topic instead.`,
    );
  }
}

// Saves only if nobody else saved in between (version check)
async function writeChapters(existing: any, chapters: any, user: AuthUser) {
  await assertUsedTopicsKept(existing, chapters);
  const updated = await Syllabus.findOneAndUpdate(
    { _id: existing._id, version: existing.version },
    { $set: { chapters, updatedBy: user.id }, $inc: { version: 1 } },
    { new: true },
  );
  if (!updated) throw conflict('Someone else changed this syllabus just now. Reload the page and try again.');
  return updated;
}

export async function getSyllabus(ctx: RequestContext, { classId, subjectId }: { classId: string; subjectId: string }) {
  return Syllabus.findOne({ schoolId: ctx.schoolId, classId, subjectId });
}

export async function getSyllabusById(ctx: RequestContext, id: any) {
  const syl = await Syllabus.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!syl) throw notFound('This syllabus does not exist.');
  return syl;
}

// Syllabus page → Save
export async function saveSyllabus(ctx: RequestContext, user: AuthUser, body: any) {
  const existing = await getSyllabus(ctx, body);

  if (!existing) {
    return Syllabus.create({
      _id: body.id || undefined,
      schoolId: ctx.schoolId,
      classId: body.classId,
      subjectId: body.subjectId,
      board: body.board || ctx.boardId || undefined,
      chapters: normalise(body.chapters, null, user),
      updatedBy: user.id,
    });
  }

  if (body.version !== undefined && body.version !== existing.version) {
    throw conflict('This syllabus was changed by someone else after you opened it. Reload the page and try again.');
  }
  return writeChapters(existing, normalise(body.chapters, existing, user), user);
}

// Excel rows → syllabus. Chapters/topics with the same name keep their ids.
export async function importSyllabus(ctx: RequestContext, user: AuthUser, { classId, subjectId, board, rows }: { classId: string; subjectId: string; board?: string; rows: Record<string, any>[] }) {
  const existing = await getSyllabus(ctx, { classId, subjectId });
  const oldChapters = new Map(existing?.chapters.map((c) => [key(c.title), c]) || []);

  const chapters: any[] = [];
  const skipped: any[] = [];
  rows.forEach((r: any, i: any) => {
    const chName = String(r.Chapter ?? r.chapter ?? '').trim();
    const tpName = String(r.Topic ?? r.topic ?? '').trim();
    if (!chName || !tpName) {
      skipped.push(i + 2);
      return;
    }
    let ch = chapters.find((c) => key(c.title) === key(chName));
    if (!ch) {
      const old = oldChapters.get(key(chName));
           ch = {
        id: old?._id,
        title: chName,
        term: String(r.Term ?? r.term ?? '').trim() || 'Term 1',
        // Optional From / To columns. Empty = keep what was set on the page.
        startDate: excelDate(r.From ?? r.from) ?? old?.startDate,
        endDate: excelDate(r.To ?? r.to) ?? old?.endDate,
        topics: [],
        old,
      };
      chapters.push(ch);
    } else {
      ch.startDate = excelDate(r.From ?? r.from) ?? ch.startDate;
      ch.endDate = excelDate(r.To ?? r.to) ?? ch.endDate;
    }
    const oldTopic = ch.old?.topics.find((t: any) => key(t.title) === key(tpName));
    ch.topics.push({
      id: oldTopic?._id,
      title: tpName,
      estPeriods: Math.max(1, parseInt(r.Periods ?? r.periods, 10) || 1),
      subtopics: String(r.Subtopics ?? r.subtopics ?? '')
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean),
    });
  });
    if (!chapters.length) throw badRequest('No rows found. The sheet needs columns: Chapter, Topic, Periods, Subtopics (optional: Term, From, To).');
  const backwards = chapters.find((c) => c.startDate && c.endDate && c.endDate < c.startDate);
  if (backwards) throw badRequest(`"${backwards.title}": the To date is before the From date.`);

  const syllabus = existing
    ? await writeChapters(existing, normalise(chapters, existing, user), user)
    : await saveSyllabus(ctx, user, { classId, subjectId, board, chapters });
  return { syllabus, skippedRows: skipped };
}

// Teacher / HOD adds one topic (a lesson not yet in the syllabus)
export async function addTopic(ctx: RequestContext, user: AuthUser, syllabusId: any, input: any) {
  const existing = await getSyllabusById(ctx, syllabusId);
  const chapters = existing.toObject({ transform: false }).chapters; // raw: keep _id

  let chapter;
  if (input.chapterId) {
    chapter = chapters.find((c) => c._id === input.chapterId);
    if (!chapter) throw badRequest('That chapter is not in this syllabus.');
  } else {
    chapter = chapters.find((c) => key(c.title) === key(input.chapterTitle));
    if (!chapter) {
      chapter = { _id: newId('ch'), title: input.chapterTitle, term: input.term || 'Term 1', topics: [] };
      chapters.push(chapter);
    }
  }
  if (chapter.topics.some((t) => key(t.title) === key(input.title))) {
    throw conflict(`"${input.title}" is already in the chapter "${chapter.title}".`);
  }

  const topic = {
    _id: newId('tp'),
    chapterId: chapter._id,
    title: input.title,
    estPeriods: input.estPeriods,
    subtopics: input.subtopics.length ? input.subtopics : [input.title],
    source: user.role === 'teacher' ? 'teacher' : 'syllabus',
    addedBy: user.id,
    addedAt: new Date(),
  };
  const at = input.afterTopicId ? chapter.topics.findIndex((t) => t._id === input.afterTopicId) : -1;
  if (input.afterTopicId && at === -1) throw badRequest('afterTopicId is not in that chapter.');
  chapter.topics.splice(at === -1 ? chapter.topics.length : at + 1, 0, topic);

  chapters.forEach((c, ci) => {
    c.order = ci + 1;
    c.topics.forEach((t, ti) => (t.order = ti + 1));
  });

  const syllabus = await writeChapters(existing, chapters, user);
  const { _id, ...rest } = topic;
  return { syllabus, topic: { id: _id, ...rest } };
}