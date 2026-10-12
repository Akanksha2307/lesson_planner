// The school's structure: departments (with their HOD), classes, sections, subjects,
// timetable, holidays and exams
import mongoose from 'mongoose';
import { schoolModel, req } from './schoolModel.js';

// hodId = the staff id of this department's HOD
export const Department = mongoose.model('Department', schoolModel('dept', { name: req(String), hodId: String }));
export const SchoolClass = mongoose.model('SchoolClass', schoolModel('cls', { name: req(String) }, 'classes'));
export const Section = mongoose.model('Section', schoolModel('sec', { classId: req(String), name: req(String) }));
export const Subject = mongoose.model('Subject', schoolModel('sub', { name: req(String), departmentId: String }));

// weekday: 0 = Monday … 5 = Saturday · periodId: p1 … p8 (bell schedule)
const slotSchema = schoolModel(
  'tt',
  {
    sectionId: req(String),
    subjectId: req(String),
    teacherId: req(String),
    weekday: { type: Number, required: true, min: 0, max: 6 },
    periodId: req(String),
  },
  'timetable',
);
// A class section can't have two subjects in the same period
slotSchema.index({ schoolId: 1, sectionId: 1, weekday: 1, periodId: 1 }, { unique: true });
export const TimetableSlot = mongoose.model('TimetableSlot', slotSchema);

// date is "YYYY-MM-DD" (same as the frontend)
export const Holiday = mongoose.model('Holiday', schoolModel('hol', { date: req(String), title: req(String) }));
export const Exam = mongoose.model('Exam', schoolModel('exam', { date: req(String), title: req(String) }));