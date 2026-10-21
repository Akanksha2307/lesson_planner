// A LOGIN: what auth-service needs to let someone in and to put in their token.
// The person's profile (department, timetable …) lives with the school data in another service,
// under the SAME id (t1, t3 …). That service creates and updates logins through PUT /internal/accounts.
import { Schema, model } from 'mongoose';
import { ROLES, type Role } from '../constants/roles.js';

export interface IAccount {
  _id: string; // the staff id, e.g. "t1"
  schoolId: string;
  username: string;
  // select: false → never read unless asked for (login only)
  passwordHash?: string;
  // Copied from the staff profile so the token can carry them (CONTRACTS.md section 5)
  name: string;
  role: Role;
  departmentId?: string | null;
  active: boolean;
  // Demo login picks the first person of a role by this number
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const accountSchema = new Schema<IAccount>(
  {
    _id: { type: String, required: true },
    schoolId: { type: String, required: true, index: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ROLES },
    departmentId: { type: String, default: null },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'accounts' },
);
// Two people in one school can never share a username
accountSchema.index({ schoolId: 1, username: 1 }, { unique: true });

export const Account = model<IAccount>('Account', accountSchema);