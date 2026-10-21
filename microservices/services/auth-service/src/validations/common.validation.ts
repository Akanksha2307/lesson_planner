import { z } from 'zod';

// Ids are strings like "t1", "hol-65f…", "one"
export const idString = (what = 'id') =>
  z
    .string({ error: `${what} is required` })
    .trim()
    .min(1, `${what} is required`)
    .max(100, `${what} is too long`)
    .regex(/^[\w.-]+$/, `${what} may only contain letters, numbers, "-", "_" and "."`);

// :id in the URL
export const idParams = z.object({ id: idString('id') });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD');

// x-school-id header (login, demo-login)
export const schoolIdHeader = idString('x-school-id').optional();
