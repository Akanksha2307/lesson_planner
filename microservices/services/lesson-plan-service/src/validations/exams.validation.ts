import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD");
const optionalDate = z.union([date, z.literal("")]).optional().default("");
const text = (max: number) => z.string().trim().max(max).optional().default("");
const count = z.coerce.number().int().min(0).max(1000).optional().default(0);

// POST /exams, PUT /exams/:id   (same field names as the Examinations page form)
export const examBody = z.object({
  examName: z.string().trim().min(1, "Enter the exam name.").max(100),
  academicYear: text(20),
  classId: text(50),
  section: text(20),
  subject: text(100),
  examDate: date,
  startDate: optionalDate,
  endDate: optionalDate,
  classesPerWeek: count,
  requiredPeriods: count,
  revisionPeriods: count,
  syllabusIncluded: text(1000),
  remarks: text(1000)
});

export type ExamBody = z.infer<typeof examBody>;
