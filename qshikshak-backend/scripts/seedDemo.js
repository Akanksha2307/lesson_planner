import { hashPassword } from '../src/modules/auth/auth.service.js';
import { Syllabus } from '../src/modules/syllabus/syllabus.model.js';
import {
  Department,
  Exam,
  Holiday,
  SchoolClass,
  Section,
  Settings,
  Staff,
  Subject,
  Template,
  TimetableSlot,
} from '../src/modules/masters/masters.model.js';

// Replace all records of one collection for this school.
// Also removes records with the same ids (left over from an older seed under another school id).
async function replace(Model, schoolId, rows) {
  const ids = rows.map((r) => r._id).filter(Boolean);
  await Model.deleteMany({ $or: [{ schoolId }, { _id: { $in: ids } }] });
  if (rows.length) await Model.insertMany(rows.map((r, i) => ({ order: i + 1, ...r, schoolId })));
  return rows.length;
}

const withId = ({ id, ...rest }) => (id ? { _id: id, ...rest } : rest);

export async function seedDemo(data, { schoolId, password }) {
  await Promise.all(
    [Department, SchoolClass, Section, Subject, Staff, TimetableSlot, Holiday, Exam, Template, Syllabus].map((m) =>
      m.syncIndexes(),
    ),
  );

  const passwordHash = await hashPassword(password);
  const counts = {
    departments: await replace(Department, schoolId, data.departments.map(withId)),
    classes: await replace(SchoolClass, schoolId, data.classes.map(withId)),
    sections: await replace(Section, schoolId, data.sections.map(withId)),
    subjects: await replace(Subject, schoolId, data.subjects.map(withId)),
    // Demo login: username = staff id (t1, t3, a1, p1 …), same password for everyone
    staff: await replace(Staff, schoolId, data.staff.map((s) => ({ ...withId(s), username: s.id, passwordHash }))),
    timetable: await replace(TimetableSlot, schoolId, data.timetable),
    holidays: await replace(Holiday, schoolId, data.holidays),
    exams: await replace(Exam, schoolId, data.exams),
    templates: await replace(Template, schoolId, data.templates.map(withId)),
    syllabus: await replace(
      Syllabus,
      schoolId,
      data.syllabus.map(({ id, chapters, ...s }) => ({
        _id: id,
        ...s,
        updatedBy: 'seed',
        chapters: chapters.map(({ id: cid, topics, ...c }) => ({
          _id: cid,
          ...c,
          topics: topics.map(({ id: tid, ...t }) => ({ _id: tid, ...t })),
        })),
      })),
    ),
  };

  await Settings.findOneAndUpdate(
    { _id: schoolId },
    { $set: { ...data.settings, bellSchedule: data.bellSchedule } },
    { upsert: true },
  );
  return counts;
}