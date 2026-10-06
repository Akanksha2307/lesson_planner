import mongoose from 'mongoose';
import { newId, toClient } from '../../common/ids.js';

const { Schema } = mongoose;

export const PLAN_STATUS = { DRAFT: 'draft', SUBMITTED: 'submitted', APPROVED: 'approved', RETURNED: 'returned' };
export const LESSON_STATUS = {
  PLANNED: 'planned',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  NOT_DONE: 'not_done',
  RESCHEDULED: 'rescheduled',
  CANCELLED: 'cancelled',
};

const reviewSchema = new Schema({
  _id: { type: String, default: () => newId('rev') },
  by: String, // staff id of the HOD / principal
  action: { type: String, enum: ['approved', 'returned'] },
  comment: String,
  at: { type: Date, default: Date.now },
});
reviewSchema.plugin(toClient);

const planSchema = new Schema(
  {
    _id: { type: String, default: () => newId('plan') },
    schoolId: { type: String, required: true, index: true },
    teacherId: { type: String, required: true },
    classId: { type: String, required: true },
    sectionId: { type: String, required: true },
    subjectId: { type: String, required: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },
    templateId: String,
    status: { type: String, enum: Object.values(PLAN_STATUS), default: PLAN_STATUS.DRAFT },
    reviews: { type: [reviewSchema], default: [] },
    submittedAt: Date,
  },
  { timestamps: true },
);
planSchema.index({ schoolId: 1, teacherId: 1, startDate: -1 });
planSchema.index({ schoolId: 1, status: 1 });
planSchema.plugin(toClient);

// The lesson details the teacher fills in. Extra template fields (e.g. "competency") are allowed.
export const emptyDetails = () => ({
  objectives: [],
  prerequisites: '',
  method: '',
  activities: '',
  resources: [],
  assessment: '',
  homework: '',
  timePlan: [],
});

const itemSchema = new Schema(
  {
    _id: { type: String, default: () => newId('item') },
    schoolId: { type: String, required: true },
    planId: { type: String, required: true, index: true },
    teacherId: { type: String, required: true },
    classId: String,
    sectionId: { type: String, required: true },
    subjectId: { type: String, required: true },
    date: { type: String, required: true },
    periodId: { type: String, required: true },
    topicId: String,
    topicTitle: String,
    chapterId: String,
    chapterTitle: String,
    status: { type: String, enum: Object.values(LESSON_STATUS), default: LESSON_STATUS.PLANNED },
    details: { type: Schema.Types.Mixed, default: emptyDetails },
    completion: { type: Schema.Types.Mixed, default: null }, // filled when the lesson is marked (later step)
    history: { type: [{ _id: false, at: Date, action: String, reason: String, by: String }], default: [] },
  },
  { timestamps: true, minimize: false },
);
itemSchema.index({ schoolId: 1, sectionId: 1, subjectId: 1, date: 1 });
itemSchema.index({ schoolId: 1, teacherId: 1, date: 1 });
itemSchema.index({ schoolId: 1, topicId: 1 });
itemSchema.plugin(toClient);

export const Plan = mongoose.model('Plan', planSchema);
export const PlanItem = mongoose.model('PlanItem', itemSchema, 'plan_items');