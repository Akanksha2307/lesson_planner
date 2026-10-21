// School data: classes, staff, timetable, settings, templates …
import {
  Department, Exam, Holiday, SchoolClass, Section, Settings, Staff, Subject, Template, TimetableSlot
} from "../models/index";
import { badRequest, notFound } from "../utils/AppError";
import { RequestContext } from "../types";

const list = (Model: any, schoolId: string, sort: Record<string, 1 | -1> = { order: 1 }) =>
  Model.find({ schoolId }).sort(sort);
const json = (docs: any[]) => docs.map((d: any) => d.toJSON());

// Settings without the bell schedule (that is sent separately as bellSchedule / periods)
const settingsJson = (doc: any) => {
  const { bellSchedule, id, createdAt, updatedAt, ...rest } = doc.toJSON();
  return rest;
};

export async function getSettings(schoolId: string) {
  // Creates the default settings the first time a school is used
  return Settings.findOneAndUpdate(
    { _id: schoolId },
    { $setOnInsert: { _id: schoolId } },
    { upsert: true, new: true }
  );
}

// Everything the frontend loads at start-up (same shape as the mock getMasters)
export async function getMasters(ctx: RequestContext) {
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
      getSettings(schoolId)
    ]);

  // Demo "View as" switch: the first person of each role
  const usersByRole: Record<string, string> = {};
  staff.forEach((s: any) => {
    usersByRole[s.role] ??= s.id;
  });

  const bellSchedule: any[] = (settings as any).bellSchedule || [];
  return {
    classes: json(classes),
    sections: json(sections),
    subjects: json(subjects),
    departments: json(departments),
    staff: staff.map(({ id, name, role, departmentId }: any) => ({ id, name, role, departmentId })),
    timetable: json(timetable),
    holidays: json(holidays),
    exams: json(exams),
    templates: json(templates),
    settings: settingsJson(settings),
    usersByRole,
    bellSchedule,
    periods: bellSchedule.filter((b: any) => b.type === "period")
  };
}

// For the other services (GET /internal/school/:schoolId) and for planning inside this service:
// everything about the school in one call.
// Includes inactive staff ("active": false) so they can tell "HOD inactive".
export async function getSchoolForServices(schoolId: string) {
  const all = (Model: any, sort?: Record<string, 1 | -1>) => list(Model, schoolId, sort).then(json);
  const [classes, sections, subjects, departments, staff, timetable, holidays, exams, templates, settings] =
    await Promise.all([
      all(SchoolClass),
      all(Section),
      all(Subject),
      all(Department),
      all(Staff),
      all(TimetableSlot, { weekday: 1, periodId: 1 }),
      all(Holiday, { date: 1 }),
      all(Exam, { date: 1 }),
      all(Template),
      getSettings(schoolId)
    ]);
  return {
    schoolId,
    classes,
    sections,
    subjects,
    departments,
    staff,
    timetable,
    holidays,
    exams,
    templates,
    settings: (settings as any).toJSON()
  };
}

export async function saveSettings(ctx: RequestContext, changes: Record<string, any>) {
  const doc = await Settings.findOneAndUpdate(
    { _id: ctx.schoolId },
    { $set: changes },
    { upsert: true, new: true, runValidators: true }
  );
  return settingsJson(doc);
}

// Only one template can be the default: making this one default turns the others off.
export async function saveTemplate(ctx: RequestContext, id: string, body: any) {
  const tpl = await Template.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!tpl) throw notFound("This template does not exist.");
  const keys = body.fields.map((f: any) => f.key);
  if (new Set(keys).size !== keys.length) throw badRequest("Two fields have the same key.");

  tpl.set(body);
  await tpl.save();
  if (body.isDefault) {
    await Template.updateMany({ schoolId: ctx.schoolId, _id: { $ne: id } }, { $set: { isDefault: false } });
  }
  return tpl.toJSON();
}
