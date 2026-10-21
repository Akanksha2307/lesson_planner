// In-memory stand-ins for the account and session repositories, so the whole login / refresh /
// logout flow can be tested without MongoDB. They replace the methods on the real repository
// objects (the services import those same objects).
import bcrypt from 'bcryptjs';
import type { Role } from '../../src/constants/roles.js';
import type { IAccount, IRefreshSession } from '../../src/models/index.js';
import { sessionRepository } from '../../src/repositories/session.repository.js';
import { accountRepository, type AccountUpsert, type AccountWithPassword } from '../../src/repositories/account.repository.js';

export const PASSWORD = 'demo123';
const hash = bcrypt.hashSync(PASSWORD, 4);

const person = (id: string, name: string, role: Role, departmentId: string | null = null): AccountWithPassword => ({
  _id: id,
  schoolId: 'one',
  order: 0,
  name,
  role,
  departmentId,
  username: id,
  passwordHash: hash,
  active: true,
});

export function installFakeRepositories() {
  const staff = new Map<string, AccountWithPassword>(
    [
      person('t1', 'Priya Sharma', 'teacher', 'd-sci'),
      person('t3', 'Anitha Rao', 'hod', 'd-sci'),
      person('a1', 'Admin', 'admin'),
      person('p1', 'Principal', 'principal'),
      person('pa1', 'Parent', 'parent'),
    ].map((s) => [s._id, s]),
  );
  const sessions = new Map<string, IRefreshSession>();
  const withoutPassword = ({ passwordHash: _p, ...s }: AccountWithPassword): IAccount => s;
  const active = (schoolId: string) => [...staff.values()].filter((s) => s.active && s.schoolId === schoolId);

  Object.assign(accountRepository, {
    findActiveByUsername: async (schoolId: string, username: string) =>
      active(schoolId).find((s) => s.username === username.toLowerCase()) ?? null,
    findActiveById: async (schoolId: string, id: string) => {
      const s = active(schoolId).find((x) => x._id === id);
      return s ? withoutPassword(s) : null;
    },
    findFirstActiveByRole: async (schoolId: string, role: Role) => {
      const s = active(schoolId).find((x) => x.role === role);
      return s ? withoutPassword(s) : null;
    },
    upsertMany: async (schoolId: string, rows: AccountUpsert[]) => {
      let created = 0;
      let updated = 0;
      for (const r of rows) {
        const before = staff.get(r.id);
        before ? updated++ : created++;
        staff.set(r.id, { ...(before ?? { order: 0 }), _id: r.id, schoolId, username: r.username, name: r.name, role: r.role, departmentId: r.departmentId, active: r.active, passwordHash: r.passwordHash ?? before?.passwordHash });
      }
      return { created, updated };
    },
  });

  const revoke = (s: IRefreshSession, reason: string) => {
    if (s.revokedAt) return 0;
    s.revokedAt = new Date();
    s.revokedReason = reason;
    return 1;
  };
  Object.assign(sessionRepository, {
    create: async (d: Omit<IRefreshSession, 'revokedAt' | 'revokedReason' | 'lastUsedAt'>) => {
      sessions.set(d._id, { ...d, revokedAt: null, revokedReason: null, lastUsedAt: new Date() });
    },
    findById: async (id: string) => {
      const s = sessions.get(id);
      return s ? { ...s } : null;
    },
    rotate: async (id: string, oldHash: string, newHash: string, expiresAt: Date) => {
      const s = sessions.get(id);
      if (!s || s.revokedAt || s.tokenHash !== oldHash) return false;
      Object.assign(s, { tokenHash: newHash, expiresAt, lastUsedAt: new Date() });
      return true;
    },
    revoke: async (id: string, reason: string) => {
      const s = sessions.get(id);
      return s ? revoke(s, reason) : 0;
    },
    revokeAllForUser: async (userId: string, reason: string) =>
      [...sessions.values()].filter((s) => s.userId === userId).reduce((n, s) => n + revoke(s, reason), 0),
  });

  return { staff, sessions };
}