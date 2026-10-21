import { z } from 'zod';
import { ROLES } from '../constants/roles.js';

// POST /api/auth/login
export const loginBody = z.object({
  username: z.string({ error: 'Username is required' }).trim().min(1, 'Username is required').max(100),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});
export type LoginBody = z.infer<typeof loginBody>;

// POST /api/auth/refresh-token
export const refreshBody = z.object({
  refreshToken: z.string({ error: 'Refresh token is required' }).trim().min(20, 'Refresh token is required').max(2000),
});
export type RefreshBody = z.infer<typeof refreshBody>;

// POST /api/auth/logout   – with refreshToken: log out this device · without: log out everywhere
export const logoutBody = z.object({
  refreshToken: z.string().trim().min(20).max(2000).optional(),
});
export type LogoutBody = z.infer<typeof logoutBody>;

// POST /api/auth/demo-login
export const demoLoginBody = z.object({ role: z.enum(ROLES, { error: `role must be one of: ${ROLES.join(', ')}` }) });
export type DemoLoginBody = z.infer<typeof demoLoginBody>;
