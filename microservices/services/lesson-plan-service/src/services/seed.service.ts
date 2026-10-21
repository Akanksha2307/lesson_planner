// Demo school from data/demo.json: staff, departments, classes, sections, subjects,
// timetable, holidays, exams, templates and settings.
// It first DELETES this school's data, so running it again resets the demo.
// (Logins are NOT created here – the Authentication service owns passwords.)
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Department, Exam, Holiday, SchoolClass, Section, Settings, Staff, Subject, Template, TimetableSlot
} from "../models/index";

const DEMO_FILE = path.join(__dirname, "..", "..", "data", "demo.json");

async function replace(Model: any, schoolId: string, rows: any[]): Promise<number> {
  const ids = rows.map((r) => r._id).filter(Boolean);
  await Model.deleteMany({ $or: [{ schoolId }, { _id: { $in: ids } }] });
  if (rows.length) await Model.insertMany(rows.map((r, i) => ({ order: i + 1, ...r, schoolId })));
  return rows.length;
}
// demo.json uses "id", MongoDB uses "_id"
const withId = ({ id, ...rest }: any) => (id ? { _id: id, ...rest } : rest);

export async function seedDemoSchool({ schoolId = "one" }: { schoolId?: string } = {}) {
  const data = JSON.parse(await readFile(DEMO_FILE, "utf8"));
  const counts = {
    departments: await replace(Department, schoolId, data.departments.map(withId)),
    classes: await replace(SchoolClass, schoolId, data.classes.map(withId)),
    sections: await replace(Section, schoolId, data.sections.map(withId)),
    subjects: await replace(Subject, schoolId, data.subjects.map(withId)),
    staff: await replace(Staff, schoolId, data.staff.map(withId)),
    timetable: await replace(TimetableSlot, schoolId, data.timetable),
    holidays: await replace(Holiday, schoolId, data.holidays),
    exams: await replace(Exam, schoolId, data.exams),
    templates: await replace(Template, schoolId, data.templates.map(withId))
  };
  await Settings.findOneAndUpdate(
    { _id: schoolId },
    { $set: { ...data.settings, bellSchedule: data.bellSchedule } },
    { upsert: true }
  );
  return counts;
}
