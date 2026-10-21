import { z } from "zod";

// PATCH /internal/plans/:id/status   (called by the Approval service)
export const internalStatusBody = z.object({
  status: z.enum(["approved", "returned"]),
  reviewerId: z.string().min(1),
  schoolId: z.string().min(1),
  comment: z.string().max(2000).default("")
});

// POST /internal/holiday-shift   (called by the Auth service)
// `date` is checked by the holiday-shift service, which has always done so.
export const internalHolidayShiftBody = z.object({
  schoolId: z.string().min(1),
  date: z.unknown().optional()
});

export type InternalStatusBody = z.infer<typeof internalStatusBody>;
export type InternalHolidayShiftBody = z.infer<typeof internalHolidayShiftBody>;
