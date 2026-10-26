import { z } from 'zod';

const isoDate = (what: any) =>
  z
    .string({ error: `${what} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${what} must be a date like 2026-10-12`)
    .refine((s) => !Number.isNaN(new Date(s).getTime()), `${what} is not a real date`);
const id = (what: any) => z.string({ error: `${what} is required` }).trim().min(1, `${what} is required`).max(100);

// GET /plans?status=submitted
// The "All" tab sends status= (empty) → no filter
const emptyToUndefined = (v: any) => (v === '' || v === 'all' ? undefined : v);
export const listQuery = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['draft', 'submitted', 'approved', 'returned']).optional()),
  teacherId: z.string().optional(),
});

// POST /plans/generate
export const generateBody = z
  .object({
    teacherId: z.string().optional(), // teachers always plan for themselves; HOD/admin may choose a teacher
    classId: id('classId'),
    sectionId: id('sectionId'),
    subjectId: id('subjectId'),
    startDate: isoDate('Start date'),
    endDate: isoDate('End date'),
    templateId: z.string().optional(),
    // Admin only: which topics to teach in this plan, in this order (empty = the next topics of the syllabus)
    topicIds: z.array(z.string().trim().min(1).max(100)).max(300).optional(),
    // Admin only: periods per topic for this plan only, { topicId: periods }
    topicPeriods: z.record(z.string(), z.coerce.number().int().min(1).max(50)).optional(),
    // Admin only: a note to the teacher
    note: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.endDate >= b.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

// POST /plans/:id/extend
export const extendBody = z.object({ endDate: isoDate('New end date') });

// PATCH /plan-items/:id
const text = z.string().max(5000);
export const updateItemBody = z.object({
  topicId: z.string().optional(),
  details: z
    .looseObject({
      objectives: z.array(z.string().trim().max(500)).max(20).optional(),
      prerequisites: text.optional(),
      method: z.string().max(100).optional(),
      activities: text.optional(),
      resources: z
        .array(z.object({ type: z.string().max(30), name: z.string().max(300), url: z.string().max(2000).optional() }).loose())
        .max(30)
        .optional(),
      assessment: text.optional(),
      homework: text.optional(),
      timePlan: z
        .array(z.object({ label: z.string().max(100), min: z.number().min(0).max(300), color: z.string().max(20).optional() }))
        .max(20)
        .optional(),
    })
    .optional(),
});

export type ListPlansQuery = z.infer<typeof listQuery>;
export type GenerateBody = z.infer<typeof generateBody>;
export type ExtendBody = z.infer<typeof extendBody>;
export type UpdateItemBody = z.infer<typeof updateItemBody>;
