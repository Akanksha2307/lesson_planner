import { z } from 'zod';

const name = (what: any) => z.string({ error: `${what} is required` }).trim().min(1, `${what} cannot be empty`).max(200);
const periods = z.coerce.number().int().min(1, 'Periods must be at least 1').max(100).default(1);
const subtopics = z.array(z.string().trim().min(1)).max(50).default([]);

export const getSyllabusQuery = z.object({
  classId: name('classId'),
  subjectId: name('subjectId'),
});

const topicInput = z.object({
  id: z.string().optional(),
  title: name('Topic name'),
  estPeriods: periods,
  subtopics,
  source: z.enum(['syllabus', 'teacher']).optional(),
  addedBy: z.string().optional(),
  addedAt: z.coerce.date().optional(),
});

// "" or null from the page = no date (the engine decides)
const optionalDate = (what: string) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${what} must be a date like 2026-08-01`)
      .refine((s) => !Number.isNaN(new Date(s).getTime()), `${what} is not a real date`)
      .optional(),
  );

const chapterInput = z
  .object({
    id: z.string().optional(),
    title: name('Chapter name'),
    term: z.string().trim().max(50).optional(),
    startDate: optionalDate('From'),
    endDate: optionalDate('To'),
    topics: z.array(topicInput).max(200).default([]),
  })
  .refine((c) => !c.startDate || !c.endDate || c.endDate >= c.startDate, {
    message: "A chapter's To date must be on or after its From date",
    path: ['endDate'],
  });

export const saveSyllabusBody = z.object({
  id: z.string().optional(),
  classId: name('classId'),
  subjectId: name('subjectId'),
  board: z.string().trim().max(50).optional(),
  version: z.number().int().optional(),
  chapters: z.array(chapterInput).max(100),
});

export const importSyllabusBody = z.object({
  classId: name('classId'),
  subjectId: name('subjectId'),
  board: z.string().trim().max(50).optional(),
  rows: z.array(z.record(z.string(), z.any())).min(1, 'The sheet is empty').max(2000),
});

export const addTopicBody = z
  .object({
    chapterId: z.string().optional(),
    chapterTitle: z.string().trim().min(1).max(200).optional(),
    term: z.string().trim().max(50).optional(),
    title: name('Topic name'),
    estPeriods: periods,
    subtopics,
    afterTopicId: z.string().optional(),
  })
  .refine((b) => b.chapterId || b.chapterTitle, { message: 'Choose a chapter or give a new chapter name' });

export type GetSyllabusQuery = z.infer<typeof getSyllabusQuery>;
export type SaveSyllabusBody = z.infer<typeof saveSyllabusBody>;
export type ImportSyllabusBody = z.infer<typeof importSyllabusBody>;
export type AddTopicBody = z.infer<typeof addTopicBody>;
