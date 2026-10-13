import { TopicLesson } from "../models/library.model.js";

// GET /library?q=&subjectId=&topicId=
export async function listLibrary(ctx, { q, subjectId, topicId }) {
  const filter = {
    schoolId: ctx.schoolId
  };

  if (subjectId) {
    filter.subjectId = subjectId;
  }

  if (topicId) {
    filter.topicId = topicId;
  }

  let rows = await TopicLesson.find(filter)
    .sort({ approvedAt: -1 })
    .lean();

  if (q) {
    const keyword = q.toLowerCase();

    rows = rows.filter((row) =>
      `${row.topicTitle || ""} ${row.chapterTitle || ""}`
        .toLowerCase()
        .includes(keyword)
    );
  }

  // Keep the newest approved lesson for each topic and teacher.
  const newest = new Map();

  for (const row of rows) {
    const key = `${row.topicId}|${row.teacherId}`;

    if (!newest.has(key)) {
      newest.set(key, row);
    }
  }

  return [...newest.values()].map(({ _id, ...row }) => ({
    id: _id,
    ...row
  }));
}