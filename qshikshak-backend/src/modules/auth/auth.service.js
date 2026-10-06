import bcrypt from 'bcryptjs';
import { Staff } from '../masters/masters.model.js';
import { signToken } from '../../common/auth.js';
import { notFound, unauthorized } from '../../common/response.js';

const publicUser = (s) => ({ id: s.id, name: s.name, role: s.role, departmentId: s.departmentId, schoolId: s.schoolId });

const session = (staff) => {
  const user = publicUser(staff);
  return { token: signToken(user), user };
};

export const hashPassword = (plain) => bcrypt.hash(plain, 10);

export async function login(schoolId, { username, password }) {
  const staff = await Staff.findOne({ schoolId, username: username.toLowerCase(), active: true }).select('+passwordHash');
  // Same message for "no such user" and "wrong password" – does not reveal which usernames exist
  const okPassword = staff?.passwordHash && (await bcrypt.compare(password, staff.passwordHash));
  if (!okPassword) throw unauthorized('Wrong username or password.');
  return session(staff);
}

// Demo only (the "View as" switch in the top bar): log in as the first person with this role.
export async function demoLogin(schoolId, role) {
  const staff = await Staff.findOne({ schoolId, role, active: true }).sort({ order: 1 });
  if (!staff) throw notFound(`No ${role} found in this school. Run npm run seed first.`);
  return session(staff);
}

export async function me(user, schoolId) {
  const staff = await Staff.findOne({ _id: user.id, schoolId, active: true });
  if (!staff) throw unauthorized('Your account was not found. Please log in again.');
  return publicUser(staff);
}