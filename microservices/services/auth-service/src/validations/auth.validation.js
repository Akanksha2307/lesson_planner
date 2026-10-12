import { z } from 'zod';
import { ROLES } from '../constants/roles.js';

// POST /api/auth/login
export const loginBody = z.object({
  username: z.string({ error: 'Username is required' }).trim().min(1, 'Username is required').max(100),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

// POST /api/auth/demo-login
export const demoLoginBody = z.object({ role: z.enum(ROLES) });