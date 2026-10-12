// Login logic – no req/res here, only data in and data out
import bcrypt from 'bcryptjs';
import { Staff } from '../models/index.js';
import { signToken } from '../utils/jwt.js';
import { notFound, unauthorized } from '../utils/response.js';

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

// Demo only ("View as" switch): log in as the first active person with this role
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