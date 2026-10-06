import mongoose from 'mongoose';
import { newId, toClient } from '../../common/ids.js';

const topicSchema = new mongoose.Schema({
  _id: { type: String, default: () => newId('tp') },
  chapterId: String,
  title: { type: String, required: true, trim: true },
  order: Number,
  estPeriods: { type: Number, default: 1, min: 1 },
  subtopics: { type: [String], default: [] },
  // 'syllabus' = added by admin/HOD, 'teacher' = added by a teacher while planning
  source: { type: String, enum: ['syllabus', 'teacher'], default: 'syllabus' },
  addedBy: String,
  addedAt: Date,
});

const chapterSchema = new mongoose.Schema({
  _id: { type: String, default: () => newId('ch') },
  title: { type: String, required: true, trim: true },
  term: { type: String, default: 'Term 1' },
  order: Number,
  topics: { type: [topicSchema], default: [] },
});

const syllabusSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId('syl') },
    schoolId: { type: String, required: true, index: true },
    classId: { type: String, required: true },
    subjectId: { type: String, required: true },
    board: String,
    chapters: { type: [chapterSchema], default: [] },
    // Goes up by 1 on every save – stops two people overwriting each other
    version: { type: Number, default: 1 },
    updatedBy: String,
  },
  { timestamps: true },
);

// Only one syllabus per school + class + subject
syllabusSchema.index({ schoolId: 1, classId: 1, subjectId: 1 }, { unique: true });

[topicSchema, chapterSchema, syllabusSchema].forEach((s) => s.plugin(toClient));

export const Syllabus = mongoose.model('Syllabus', syllabusSchema);