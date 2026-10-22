import type { Role } from '../constants/roles.js';

// Who is calling – set by authenticate() from the access token
export interface AuthUser {
  id: string;
  role: Role;
  name?: string;
  departmentId?: string | null;
  schoolId: string;
}

// Access token payload made by auth-service (CONTRACTS.md section 5)
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  name?: string;
  departmentId?: string | null;
  schoolId: string;
  type: 'access';
}
