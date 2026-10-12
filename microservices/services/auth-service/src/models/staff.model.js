// Everyone who can log in: teachers, HODs, principal, admin, parents
import mongoose from 'mongoose';
import { ROLES } from '../constants/roles.js';
import { schoolModel, req } from './schoolModel.js';

const staffSchema = schoolModel(
  'stf',
  {
    name: req(String),
    role: { type: String, required: true, enum: ROLES },
    departmentId: String,
    username: { type: String, required: true, trim: true, lowercase: true },
    // select: false → never sent back unless asked for (login only)
    passwordHash: { type: String, select: false },
    active: { type: Boolean, default: true },
  },
  'staff',
);
staffSchema.index({ schoolId: 1, username: 1 }, { unique: true });

export const Staff = mongoose.model('Staff', staffSchema);