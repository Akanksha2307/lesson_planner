import { z } from 'zod';

// Ids such as "plan-6710a2…", "t1", "one": no spaces, "$" or slashes (no database tricks)
export const idString = (what = 'id') =>
  z
    .string({ error: `${what} is required` })
    .trim()
    .min(1, `${what} is required`)
    .max(100, `${what} is too long`)
    .regex(/^[\w.-]+$/, `${what} may only contain letters, numbers, "-", "_" and "."`);

// A MongoDB ObjectId (24 hex characters) – approval and notification records
export const objectId = (what = 'id') => z.string().regex(/^[a-f\d]{24}$/i, `${what} is not a valid id`);
