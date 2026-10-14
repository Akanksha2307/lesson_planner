import { z } from 'zod';

const name = (what) => z.string({ error: `${what} is required` }).trim().min(1, `${what} cannot be empty`).max(200);
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

const chapterInput = z.object({
  id: z.string().optional(),
  title: name('Chapter name'),
  term: z.string().trim().max(50).optional(),
  topics: z.array(topicInput).max(200).default([]),
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