import { z } from 'zod';
import { ROLES } from '../constants/roles.js';
import { idString } from './common.validation.js';

// PUT /internal/accounts   (lesson-plan-service creates / updates staff logins)
const account = z.object({
  id: idString('id'),
  username: z.string().trim().toLowerCase().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  departmentId: z.string().trim().max(100).nullable().optional().default(null),
  active: z.boolean().default(true),
  // Only when setting a (new) password
  password: z.string().min(6).max(200).optional(),
});

export const accountsBody = z.object({
  schoolId: idString('schoolId'),
  accounts: z
    .array(account)
    .min(1, 'Send at least one account')
    .max(1000)
    .refine((list) => new Set(list.map((a) => a.id)).size === list.length, 'Two accounts have the same id.')
    .refine((list) => new Set(list.map((a) => a.username)).size === list.length, 'Two accounts have the same username.'),
});
export type AccountsBody = z.infer<typeof accountsBody>;