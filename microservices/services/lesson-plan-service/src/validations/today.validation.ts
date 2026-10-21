import { z } from "zod";

export const todayQuery = z.object({
  date: z.iso.date().optional()
});

export type TodayQuery = z.infer<typeof todayQuery>;
