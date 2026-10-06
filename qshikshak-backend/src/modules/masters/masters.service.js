import { Department, Exam, Holiday, SchoolClass, Section, Settings, Staff, Subject, Template, TimetableSlot } from './masters.model.js';
import { badRequest, notFound } from '../../common/response.js';

const list = (Model, schoolId, sort = { order: 1 }) => Model.find({ schoolId }).sort(sort);
const json = (docs) => docs.map((d) => d.toJSON());

// Settings without the bell schedule (that is sent separately as bellSchedule / periods)
const settingsJson = (doc) => {
  const { bellSchedule, id, createdAt, updatedAt, ...rest } = doc.toJSON();
  return rest;
};

export async function getSettings(schoolId) {
  // Creates the default settings the first time a school is used
  return Settings.findOneAndUpdate({ _id: schoolId }, { $setOnInsert: { _id: schoolId } }, { upsert: true, new: true });
}

// Everything the frontend loads at start-up (same shape as the mock getMasters)
export async function getMasters(ctx) {
  const { schoolId } = ctx;
  const [classes, sections, subjects, departments, staff, timetable, holidays, exams, templates, settings] =
    await Promise.all([
      list(SchoolClass, schoolId),
      list(Section, schoolId),
      list(Subject, schoolId),
      list(Department, schoolId),
      Staff.find({ schoolId, active: true }).sort({ order: 1 }),
      list(TimetableSlot, schoolId, { weekday: 1, periodId: 1 }),
      list(Holiday, schoolId, { date: 1 }),
      list(Exam, schoolId, { date: 1 }),
      list(Template, schoolId),
      getSettings(schoolId),
    ]);

  // Demo "View as" switch: the first person of each role
  const usersByRole = {};
  staff.forEach((s) => {
    usersByRole[s.role] ??= s.id;
  });

  const bellSchedule = settings.bellSchedule || [];
  return {
    classes: json(classes),
    sections: json(sections),
    subjects: json(subjects),
    departments: json(departments),
    staff: staff.map(({ id, name, role, departmentId }) => ({ id, name, role, departmentId })),
    timetable: json(timetable),
    holidays: json(holidays),
    exams: json(exams),
    templates: json(templates),
    settings: settingsJson(settings),
    usersByRole,
    bellSchedule,
    periods: bellSchedule.filter((b) => b.type === 'period'),
  };
}

export async function saveSettings(ctx, changes) {
  const doc = await Settings.findOneAndUpdate(
    { _id: ctx.schoolId },
    { $set: changes },
    { upsert: true, new: true, runValidators: true },
  );
  return settingsJson(doc);
}

// Only one template can be the default: making this one default turns the others off.
export async function saveTemplate(ctx, id, body) {
  const tpl = await Template.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!tpl) throw notFound('This template does not exist.');
  const keys = body.fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) throw badRequest('Two fields have the same key.');

  tpl.set(body);
  await tpl.save();
  if (body.isDefault) {
    await Template.updateMany({ schoolId: ctx.schoolId, _id: { $ne: id } }, { $set: { isDefault: false } });
  }
  return tpl.toJSON();
}

// Used later by plans and approvals: who is the HOD for a subject's department?
export async function hodForSubject(schoolId, subjectId) {
  const subject = await Subject.findOne({ _id: subjectId, schoolId });
  if (!subject?.departmentId) return null;
  const dept = await Department.findOne({ _id: subject.departmentId, schoolId });
  return dept?.hodId || null;
}