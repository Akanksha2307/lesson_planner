import { z } from "zod";

// GET /internal/school/:schoolId
export const schoolIdParams = z.object({
  schoolId: z.string().min(1).max(200)
});

// POST /internal/seed  (development only)
export const seedBody = z
  .object({
    schoolId: z.string().min(1).max(200).optional()
  })
  .optional();

export type SchoolIdParams = z.infer<typeof schoolIdParams>;
