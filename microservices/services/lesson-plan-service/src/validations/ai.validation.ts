import { z } from "zod";

export const suggestBody = z.object({
  topicTitle: z.string().trim().min(1).max(300),
  minutes: z.number().int().min(1).max(600)
});

export type SuggestBody = z.infer<typeof suggestBody>;
