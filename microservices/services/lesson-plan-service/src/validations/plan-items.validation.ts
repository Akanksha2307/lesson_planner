import { z } from "zod";

// "YYYY-MM-DD" and a real calendar date
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === value;
  },
  "Invalid date"
);

// ?from= (empty) has always meant "no filter"
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const targetBody = z.object({
  date: dateSchema,
  periodId: z.string().min(1),
  reason: z.string().optional()
});

export const reasonBody = z.object({
  reason: z.string().trim().min(1)
});

export const swapBody = z.object({
  firstItemId: z.string().min(1),
  secondItemId: z.string().min(1)
});

export const addPeriodsBody = z.object({
  count: z.number().int().min(1).max(10),
  reason: z.string().optional()
});

// GET /history
export const historyQuery = z.object({
  from: z.preprocess(emptyToUndefined, dateSchema.optional()),
  to: z.preprocess(emptyToUndefined, dateSchema.optional()),
  teacherId: z.string().optional(),
  sectionId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.string().optional()
});

// GET /reports/coverage
export const coverageQuery = z.object({
  sectionId: z.string().optional(),
  subjectId: z.string().optional()
});

export type TargetBody = z.infer<typeof targetBody>;
export type ReasonBody = z.infer<typeof reasonBody>;
export type SwapBody = z.infer<typeof swapBody>;
export type AddPeriodsBody = z.infer<typeof addPeriodsBody>;
export type HistoryQuery = z.infer<typeof historyQuery>;
export type CoverageQuery = z.infer<typeof coverageQuery>;
