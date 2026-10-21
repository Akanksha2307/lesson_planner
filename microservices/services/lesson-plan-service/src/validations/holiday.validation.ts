import { z } from "zod";

// GET /holidays/impact?date=YYYY-MM-DD   (the date's format is checked by the service)
export const holidayImpactQuery = z.object({
  date: z.string().min(1, "Holiday date is required")
});

export type HolidayImpactQuery = z.infer<typeof holidayImpactQuery>;

// POST /holidays, PUT /holidays/:id   (the frontend calls the title "name"; both are accepted)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD");
const text = (max: number) => z.string().trim().max(max).optional().default("");

export const holidayBody = z
  .object({
    name: z.string().trim().max(100).optional(),
    title: z.string().trim().max(100).optional(),
    date,
    description: text(500),
    unexpected: z.boolean().optional().default(false)
  })
  .transform(({ name, title, ...rest }) => ({ ...rest, title: (title || name || "").trim() }))
  .refine((h) => h.title.length > 0, { message: "Enter a holiday name.", path: ["name"] });

export type HolidayBody = z.infer<typeof holidayBody>;
