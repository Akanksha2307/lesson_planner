// All database reads/writes for logins. Services never call the Account model directly.
import type { Role } from '../constants/roles.js';
import { Account, type IAccount } from '../models/index.js';

export type AccountWithPassword = IAccount & { passwordHash?: string };

// One login as lesson-plan-service sends it (PUT /internal/accounts)
export interface AccountUpsert {
  id: string;
  username: string;
  name: string;
  role: Role;
  departmentId: string | null;
  active: boolean;
  passwordHash?: string;
}

export const accountRepository = {
  // Login only: the one place that reads the password hash
  findActiveByUsername(schoolId: string, username: string): Promise<AccountWithPassword | null> {
    return Account.findOne({ schoolId, username: username.toLowerCase(), active: true })
      .select('+passwordHash')
      .lean<AccountWithPassword>()
      .exec();
  },

  findActiveById(schoolId: string, id: string): Promise<IAccount | null> {
    return Account.findOne({ _id: id, schoolId, active: true }).lean<IAccount>().exec();
  },

  // Demo "View as": the first active person with this role
  findFirstActiveByRole(schoolId: string, role: Role): Promise<IAccount | null> {
    return Account.findOne({ schoolId, role, active: true }).sort({ order: 1 }).lean<IAccount>().exec();
  },

  // Create or update many logins in one database round trip. The password hash is only
  // changed when one is given, so syncing a profile never resets someone's password.
  async upsertMany(schoolId: string, rows: AccountUpsert[]): Promise<{ created: number; updated: number }> {
    const result = await Account.bulkWrite(
      rows.map((r, i) => ({
        updateOne: {
          filter: { _id: r.id },
          update: {
            $set: {
              schoolId,
              username: r.username.toLowerCase(),
              name: r.name,
              role: r.role,
              departmentId: r.departmentId,
              active: r.active,
              ...(r.passwordHash ? { passwordHash: r.passwordHash } : {}),
            },
            $setOnInsert: { order: i + 1 },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return { created: result.upsertedCount, updated: result.matchedCount };
  },
};