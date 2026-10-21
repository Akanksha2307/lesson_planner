import { z } from "zod";

export const calendarQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    sectionId: z.string().optional(),
    subjectId: z.string().optional()
  })
  .refine((filters) => filters.from <= filters.to, {
    message: "'from' must be before or equal to 'to'",
    path: ["from"]
  });

export type CalendarQuery = z.infer<typeof calendarQuery>;
