// The demo logins (password demo123). Same ids as the demo staff in the school data.
// Used by `npm run seed` here and by the integration tests.
import type { AccountInput } from '../src/services/auth.service.js';

export const DEMO_PASSWORD = 'demo123';

export const DEMO_ACCOUNTS: AccountInput[] = [
  { id: 't1', username: 't1', name: 'Priya Sharma', role: 'teacher', departmentId: 'd-sci', active: true },
  { id: 't2', username: 't2', name: 'Ravi Kumar', role: 'teacher', departmentId: 'd-math', active: true },
  { id: 't5', username: 't5', name: 'Kavya Reddy', role: 'teacher', departmentId: 'd-lang', active: true },
  { id: 't3', username: 't3', name: 'Anitha Rao', role: 'hod', departmentId: 'd-sci', active: true },
  { id: 'a1', username: 'a1', name: 'Suresh Varma', role: 'admin', departmentId: null, active: true },
  { id: 'p1', username: 'p1', name: 'Dr. Meena Iyer', role: 'principal', departmentId: null, active: true },
  { id: 'pa1', username: 'pa1', name: 'Demo Parent', role: 'parent', departmentId: null, active: true },
].map((a) => ({ ...a, password: DEMO_PASSWORD }) as AccountInput);