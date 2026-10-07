// Mock login – same answer as the real backend's POST /api/auth/login.
// Demo accounts: username = staff id (t1, t2, t5, t3, a1, p1, pa1), password "demo123".
import { staff } from '../seed';
import { ok, fail } from './helpers';

export const DEMO_PASSWORD = 'demo123';

export const login = ({ username, password }) => {
  const person = staff.find((s) => s.id === String(username || '').trim().toLowerCase());
  if (!person || password !== DEMO_PASSWORD) return fail('Wrong username or password.');
  const { id, name, role, departmentId } = person;
  return ok({ token: `mock-token-${id}`, user: { id, name, role, departmentId, schoolId: 'one' } }, 'Logged in');
};