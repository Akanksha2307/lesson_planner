import { z } from "zod";

export const rescheduleBody = z.object({
  date: z.string(),
  periodId: z.string().min(1),
  reason: z.string().trim().min(1)
});

export type RescheduleBody = z.infer<typeof rescheduleBody>;
