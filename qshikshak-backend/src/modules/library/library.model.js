// Lesson library: a copy of every approved lesson, saved against its syllabus topic.
// Teachers reuse these ("copy from library") when planning the same topic later.
// The id is the lesson's own id, so the frontend can open it like any lesson.
import mongoose from 'mongoose';
import { toClient } from '../../common/ids.js';

const schema = new mongoose.Schema(
  {
    _id: String, // = the plan item (lesson) id
    schoolId: { type: String, required: true },
    topicId: { type: String, required: true },
    topicTitle: String,
    chapterId: String,
    chapterTitle: String,
    classId: String,
    sectionId: String,
    subjectId: String,
    teacherId: String,
    planId: String,
    date: String,
    periodId: String,
    status: String,
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    approvedBy: String,
    approvedAt: Date,
  },
  { timestamps: true, minimize: false, collection: 'topic_lessons' },
);
schema.index({ schoolId: 1, topicId: 1, approvedAt: -1 });
schema.index({ schoolId: 1, subjectId: 1 });
schema.plugin(toClient);

export const TopicLesson = mongoose.model('TopicLesson', schema);
