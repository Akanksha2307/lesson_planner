import { Syllabus } from './syllabus.model.js';
import { newId } from '../../common/ids.js';
import { badRequest, conflict, notFound } from '../../common/response.js';

const key = (s) => String(s || '').trim().toLowerCase();

// Adds order numbers and defaults. Existing topics keep their id, source and addedBy.
function normalise(chapters, previous, user) {
  const oldTopics = new Map();
  previous?.chapters.forEach((c) => c.topics.forEach((t) => oldTopics.set(t._id, t)));
  const seenIds = new Set();
  const freshId = (id, prefix) => {
    const ok = id && !seenIds.has(id);
    const finalId = ok ? id : newId(prefix);
    seenIds.add(finalId);
    return finalId;
  };

  return chapters.map((c, ci) => {
    const chapterId = freshId(c.id, 'ch');
    return {
      _id: chapterId,
      title: c.title,
      term: c.term || 'Term 1',
      order: ci + 1,
      topics: c.topics.map((t, ti) => {
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

// Saves only if nobody else saved in between (version check)
async function writeChapters(existing, chapters, user) {
  const updated = await Syllabus.findOneAndUpdate(
    { _id: existing._id, version: existing.version },
    { $set: { chapters, updatedBy: user.id }, $inc: { version: 1 } },
    { new: true },
  );
  if (!updated) throw conflict('Someone else changed this syllabus just now. Reload the page and try again.');
  return updated;
}

export async function getSyllabus(ctx, { classId, subjectId }) {
  return Syllabus.findOne({ schoolId: ctx.schoolId, classId, subjectId });
}

export async function getSyllabusById(ctx, id) {
  const syl = await Syllabus.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!syl) throw notFound('This syllabus does not exist.');
  return syl;
}

// Syllabus page → Save
export async function saveSyllabus(ctx, user, body) {
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
export async function importSyllabus(ctx, user, { classId, subjectId, board, rows }) {
  const existing = await getSyllabus(ctx, { classId, subjectId });
  const oldChapters = new Map(existing?.chapters.map((c) => [key(c.title), c]) || []);

  const chapters = [];
  const skipped = [];
  rows.forEach((r, i) => {
    const chName = String(r.Chapter ?? r.chapter ?? '').trim();
    const tpName = String(r.Topic ?? r.topic ?? '').trim();
    if (!chName || !tpName) {
      skipped.push(i + 2);
      return;
    }
    let ch = chapters.find((c) => key(c.title) === key(chName));
    if (!ch) {
      const old = oldChapters.get(key(chName));
      ch = { id: old?._id, title: chName, term: String(r.Term ?? r.term ?? '').trim() || 'Term 1', topics: [], old };
      chapters.push(ch);
    }
    const oldTopic = ch.old?.topics.find((t) => key(t.title) === key(tpName));
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
  if (!chapters.length) throw badRequest('No rows found. The sheet needs columns: Chapter, Topic, Periods, Subtopics.');

  const syllabus = existing
    ? await writeChapters(existing, normalise(chapters, existing, user), user)
    : await saveSyllabus(ctx, user, { classId, subjectId, board, chapters });
  return { syllabus, skippedRows: skipped };
}

// Teacher / HOD adds one topic (a lesson not yet in the syllabus)
export async function addTopic(ctx, user, syllabusId, input) {
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