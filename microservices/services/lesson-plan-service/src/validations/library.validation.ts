import { z } from "zod";

export const libraryQuery = z.object({
  q: z.string().max(100).optional(),
  subjectId: z.string().optional(),
  topicId: z.string().optional()
});

export type LibraryQuery = z.infer<typeof libraryQuery>;
