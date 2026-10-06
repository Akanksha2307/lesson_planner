import mongoose from 'mongoose';
import { newId, toClient } from '../../common/ids.js';

const { Schema } = mongoose;

// Builds a model with: string id, schoolId, order (for sorting) and the fields given.
function schoolModel(name, prefix, fields, collection) {
  const schema = new Schema(
    {
      _id: { type: String, default: () => newId(prefix) },
      schoolId: { type: String, required: true, index: true },
      order: { type: Number, default: 0 },
      ...fields,
    },
    { timestamps: true, collection },
  );
  schema.plugin(toClient);
  return { schema, model: () => mongoose.model(name, schema) };
}

const req = (type) => ({ type, required: true, trim: type === String });

export const Department = schoolModel('Department', 'dept', { name: req(String), hodId: String }).model();
export const SchoolClass = schoolModel('SchoolClass', 'cls', { name: req(String) }, 'classes').model();
export const Section = schoolModel('Section', 'sec', { classId: req(String), name: req(String) }).model();
export const Subject = schoolModel('Subject', 'sub', { name: req(String), departmentId: String }).model();

const staff = schoolModel('Staff', 'stf', {
  name: req(String),
  role: { type: String, required: true, enum: ['teacher', 'hod', 'admin', 'principal', 'parent'] },
  departmentId: String,
  username: { type: String, required: true, trim: true, lowercase: true },
  // select: false → never sent back unless asked for (login only)
  passwordHash: { type: String, select: false },
  active: { type: Boolean, default: true },
}, 'staff');
staff.schema.index({ schoolId: 1, username: 1 }, { unique: true });
export const Staff = staff.model();

// weekday: 0 = Monday … 5 = Saturday · periodId: p1 … p8 (bell schedule)
const slot = schoolModel('TimetableSlot', 'tt', {
  sectionId: req(String),
  subjectId: req(String),
  teacherId: req(String),
  weekday: { type: Number, required: true, min: 0, max: 6 },
  periodId: req(String),
}, 'timetable');
// A class section can't have two subjects in the same period
slot.schema.index({ schoolId: 1, sectionId: 1, weekday: 1, periodId: 1 }, { unique: true });
export const TimetableSlot = slot.model();

// date is "YYYY-MM-DD" (same as the frontend)
export const Holiday = schoolModel('Holiday', 'hol', { date: req(String), title: req(String) }).model();
export const Exam = schoolModel('Exam', 'exam', { date: req(String), title: req(String) }).model();

export const Template = schoolModel('Template', 'tpl', {
  name: req(String),
  board: String,
  isDefault: { type: Boolean, default: false },
  // [{ key, label, type, enabled, required }] – the fields shown in the lesson form
  fields: { type: [Schema.Types.Mixed], default: [] },
}).model();

// One settings record per school (its id is the school id)
const settingsSchema = new Schema(
  {
    _id: String,
    approvalRequired: { type: Boolean, default: true },
    approver: { type: String, default: 'hod' },
    submissionDay: { type: String, default: 'Saturday' },
    dailyReminderTime: { type: String, default: '18:00' },
    autoShift: { type: Boolean, default: true },
    skipHolidays: { type: Boolean, default: true },
    skipExams: { type: Boolean, default: true },
    whatsappHomework: { type: Boolean, default: false },
    editAfterApproval: { type: String, enum: ['reapprove', 'allow'], default: 'reapprove' },
    // The principal may review a plan the HOD has not reviewed after this many days
    principalAfterDays: { type: Number, default: 2, min: 0, max: 30 },
    // [{ id, type: 'period' | 'break' | 'assembly' | 'study', label, start, end }]
    bellSchedule: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, collection: 'settings' },
);
settingsSchema.plugin(toClient);
export const Settings = mongoose.model('Settings', settingsSchema);