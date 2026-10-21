// Holidays and exams (Holidays page, Examinations page).
// Saved here because this service owns the school calendar; planning reads them straight
// from the same database, so the timetable and planning pick them up automatically.
import { Exam, ExamPlan, Holiday, Staff } from "../models/index";
import { conflict, notFound } from "../utils/AppError";
import { notify } from "./notification-client.service";
import { shiftLessonsForHoliday } from "./holiday-shift.service";
import { AuthUser, RequestContext } from "../types";

// Today in India as YYYY-MM-DD (the server itself may run in UTC)
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// The frontend calls a holiday's title "name" – send both
const holidayJson = (doc: any) => {
  const h = doc.toJSON();
  return { ...h, name: h.title };
};

// Everyone in the school except the person who made the change
async function everyoneExcept(schoolId: string, userId: string): Promise<string[]> {
  const staff = await Staff.find({ schoolId, active: true }, { _id: 1 }).lean();
  return staff.map((s: any) => s._id as string).filter((id: string) => id !== userId);
}

// Moves the lessons planned on a sudden holiday (a direct call – same service).
// Like before, a failure here never stops the holiday from being saved.
async function shiftLessons(schoolId: string, date: string): Promise<any> {
  try {
    return await shiftLessonsForHoliday(schoolId, date);
  } catch (err: any) {
    console.warn(`[lesson-plan-service] lessons could not be moved for ${date}: ${err.message}`);
    return null;
  }
}

// ---------- Holidays ----------

export async function listHolidays(ctx: RequestContext) {
  const docs = await Holiday.find({ schoolId: ctx.schoolId }).sort({ date: 1 });
  return docs.map(holidayJson);
}

export async function saveHoliday(ctx: RequestContext, user: AuthUser, id: string | undefined, body: any) {
  const { schoolId } = ctx;
  const before: any = id ? await Holiday.findOne({ _id: id, schoolId }) : null;
  if (id && !before) throw notFound("This holiday does not exist or was deleted.");

  const clash: any = await Holiday.findOne({ schoolId, date: body.date, _id: { $ne: id || null } });
  if (clash) throw conflict(`${body.date} is already a holiday (${clash.title}).`);

  const doc: any = before || new Holiday({ schoolId });
  doc.set(body);

  // Move lessons only for a sudden holiday today or later, and only when it is new,
  // its date changed, or it was just marked sudden
  const dateChanged = !before || before.date !== body.date;
  const becameSudden = !before?.unexpected && body.unexpected;
  let shift: any = null;
  if (body.unexpected && body.date >= todayISO() && (dateChanged || becameSudden)) {
    shift = await shiftLessons(schoolId, body.date);
    if (shift) {
      doc.affectedCount = shift.affectedCount || 0;
      doc.movedCount = shift.movedCount || 0;
    }
  }
  await doc.save();

  // Bell notifications
  const title = before ? "Holiday updated" : body.unexpected ? `Sudden holiday on ${body.date}` : "Holiday added";
  const notified = await notify(
    schoolId,
    await everyoneExcept(schoolId, user.id),
    title,
    `${body.title} on ${body.date}${body.unexpected ? " – lessons planned that day move to the next free period." : "."}`,
    "/lesson-planner/calendar"
  );
  if (shift?.teacherIds?.length) {
    await notify(
      schoolId,
      shift.teacherIds.filter((t: string) => t !== user.id),
      "Your lessons were moved",
      `${body.title} (${body.date}) is a sudden holiday. Your lessons from that day were moved to the next free periods.`,
      "/lesson-planner/calendar"
    );
  }

  return { ...holidayJson(doc), shift, notified: !!notified };
}

export async function deleteHoliday(ctx: RequestContext, user: AuthUser, id: string) {
  const doc: any = await Holiday.findOneAndDelete({ _id: id, schoolId: ctx.schoolId });
  if (!doc) throw notFound("This holiday does not exist or was deleted.");
  await notify(
    ctx.schoolId,
    await everyoneExcept(ctx.schoolId, user.id),
    "Holiday removed",
    `${doc.title} on ${doc.date} is no longer a holiday.`,
    "/lesson-planner/calendar"
  );
  return { id };
}

// ---------- Exams ----------

export async function listExams(ctx: RequestContext) {
  const docs = await ExamPlan.find({ schoolId: ctx.schoolId }).sort({ examDate: 1 });
  return docs.map((d: any) => d.toJSON());
}

export async function saveExam(ctx: RequestContext, user: AuthUser, id: string | undefined, body: any) {
  const { schoolId } = ctx;
  const before: any = id ? await ExamPlan.findOne({ _id: id, schoolId }) : null;
  if (id && !before) throw notFound("This exam does not exist or was deleted.");

  const doc: any = before || new ExamPlan({ schoolId });
  doc.set(body);
  await doc.save();

  // Keep the exam day in the calendar, so planning skips it
  await Exam.findOneAndUpdate(
    { schoolId, examPlanId: doc.id },
    { $set: { date: body.examDate, title: body.examName } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await notify(
    schoolId,
    await everyoneExcept(schoolId, user.id),
    before ? "Exam updated" : "Exam planned",
    `${body.examName}${body.subject ? ` – ${body.subject}` : ""} on ${body.examDate}.`,
    "/lesson-planner/examinations"
  );
  return doc.toJSON();
}

export async function deleteExam(ctx: RequestContext, user: AuthUser, id: string) {
  const doc: any = await ExamPlan.findOneAndDelete({ _id: id, schoolId: ctx.schoolId });
  if (!doc) throw notFound("This exam does not exist or was deleted.");
  await Exam.deleteMany({ schoolId: ctx.schoolId, examPlanId: id });
  await notify(
    ctx.schoolId,
    await everyoneExcept(ctx.schoolId, user.id),
    "Exam cancelled",
    `${doc.examName} on ${doc.examDate} was removed.`,
    "/lesson-planner/examinations"
  );
  return { id };
}
