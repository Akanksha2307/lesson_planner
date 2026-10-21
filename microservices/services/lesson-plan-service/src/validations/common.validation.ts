import { z } from "zod";

// /something/:id – Mongo ids in this service are strings like "plan-64f…" or "syl-c8-sci"
export const idParams = z.object({
  id: z
    .string()
    .max(200, "id is too long")
    .refine((value) => value.trim().length > 0, "id is required")
});

export type IdParams = z.infer<typeof idParams>;
