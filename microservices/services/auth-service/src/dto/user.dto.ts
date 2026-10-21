import type { Role } from '../constants/roles.js';
import type { IAccount } from '../models/index.js';

// The user as the frontend sees it – never the password hash or username
export interface UserDto {
  id: string;
  name: string;
  role: Role;
  departmentId: string | null;
  schoolId: string;
}

export const toUserDto = (s: IAccount): UserDto => ({
  id: s._id,
  name: s.name,
  role: s.role,
  departmentId: s.departmentId ?? null,
  schoolId: s.schoolId,
});