import type { Role } from '../constants/roles.js';

// What every service puts on req.user after checking the access token
export interface AuthUser {
  id: string;
  role: Role;
  name?: string;
  departmentId?: string | null;
  schoolId: string;
}

// Access token payload (CONTRACTS.md section 5). Signed HS256 with JWT_ACCESS_SECRET.
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  name: string;
  departmentId: string | null;
  schoolId: string;
  type: 'access';
}

// Refresh token payload. Signed HS256 with JWT_REFRESH_SECRET – only auth-service reads it.
// sid = the RefreshSession id in MongoDB, so a single device can be logged out.
export interface RefreshTokenPayload {
  sub: string;
  schoolId: string;
  sid: string;
  type: 'refresh';
}