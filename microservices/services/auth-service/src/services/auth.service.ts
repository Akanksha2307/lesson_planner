// Login logic – no req/res here, only data in and data out.
//
// Tokens:
//   access token  – short (ACCESS_TOKEN_EXPIRES_IN, default 15m), sent as "Authorization: Bearer …"
//                   to every service. Every service checks its signature itself with JWT_ACCESS_SECRET.
//   refresh token – long (REFRESH_TOKEN_EXPIRES_IN, default 7d), sent ONLY to POST /api/auth/refresh-token.
//                   Rotated on every use; stored only as a SHA-256 hash.
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Role } from '../constants/roles.js';
import { buildAuthResponse, type AuthResponse } from '../dto/authResponse.dto.js';
import { toUserDto, type UserDto } from '../dto/user.dto.js';
import type { IAccount } from '../models/index.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { accountRepository } from '../repositories/account.repository.js';
import type { AuthUser } from '../types/auth.types.js';
import { notFound, unauthorized } from '../utils/AppError.js';
import { newId } from '../utils/ids.js';
import { secondsUntilExpiry, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

const BCRYPT_ROUNDS = 10;
// Used when the username does not exist, so a wrong username takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const WRONG_LOGIN = 'Wrong username or password.';
const SESSION_ENDED = 'Your session has ended. Please log in again.';

export interface ClientInfo {
  userAgent: string;
  ip: string;
}

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const expiryOf = (token: string): Date => new Date(Date.now() + secondsUntilExpiry(token) * 1000);

function accessTokenFor(account: IAccount): { accessToken: string; expiresIn: number; user: UserDto } {
  const user = toUserDto(account);
  const accessToken = signAccessToken(user);
  return { accessToken, expiresIn: secondsUntilExpiry(accessToken), user };
}

// New device session: refresh token + access token
async function startSession(account: IAccount, client: ClientInfo): Promise<AuthResponse> {
  const sessionId = newId('ses');
  const refreshToken = signRefreshToken(account._id, account.schoolId, sessionId);
  await sessionRepository.create({
    _id: sessionId,
    userId: account._id,
    schoolId: account.schoolId,
    tokenHash: hashToken(refreshToken),
    expiresAt: expiryOf(refreshToken),
    userAgent: client.userAgent.slice(0, 300),
    ip: client.ip,
  });
  const { accessToken, expiresIn, user } = accessTokenFor(account);
  return buildAuthResponse(user, accessToken, refreshToken, expiresIn);
}

export async function login(schoolId: string, username: string, password: string, client: ClientInfo): Promise<AuthResponse> {
  const account = await accountRepository.findActiveByUsername(schoolId, username);
  // Same message (and about the same time) for "no such user" and "wrong password"
  const passwordOk = await bcrypt.compare(password, account?.passwordHash ?? DUMMY_HASH);
  if (!account || !account.passwordHash || !passwordOk) throw unauthorized(WRONG_LOGIN);
  return startSession(account, client);
}

// Demo only ("View as" switch): log in as the first active person with this role
export async function demoLogin(schoolId: string, role: Role, client: ClientInfo): Promise<AuthResponse> {
  const account = await accountRepository.findFirstActiveByRole(schoolId, role);
  if (!account) throw notFound(`No ${role} found in this school. Load the demo logins first (the demo seed sends them to PUT /internal/accounts).`);
  return startSession(account, client);
}

export async function refresh(refreshToken: string): Promise<AuthResponse> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized(SESSION_ENDED);
  }

  const session = await sessionRepository.findById(payload.sid);
  if (!session || session.userId !== payload.sub) throw unauthorized(SESSION_ENDED);

  const presentedHash = hashToken(refreshToken);
  if (session.revokedAt || session.tokenHash !== presentedHash) {
    // An old (already used) refresh token came back: it was probably copied.
    // Safest answer: log this user out on every device.
    if (!session.revokedAt) await sessionRepository.revokeAllForUser(session.userId, 'refresh token reused');
    throw unauthorized(SESSION_ENDED);
  }

  // The account may have been deactivated, or the role changed, since login
  const account = await accountRepository.findActiveById(session.schoolId, session.userId);
  if (!account) {
    await sessionRepository.revoke(session._id, 'account inactive');
    throw unauthorized(SESSION_ENDED);
  }

  const newRefreshToken = signRefreshToken(account._id, account.schoolId, session._id);
  const rotated = await sessionRepository.rotate(session._id, presentedHash, hashToken(newRefreshToken), expiryOf(newRefreshToken));
  if (!rotated) throw unauthorized(SESSION_ENDED); // used at the same moment by another request

  const { accessToken, expiresIn, user } = accessTokenFor(account);
  return buildAuthResponse(user, accessToken, newRefreshToken, expiresIn);
}

// With a refresh token: log out that device. Without: log out everywhere.
export async function logout(user: AuthUser, refreshToken?: string): Promise<{ sessionsEnded: number }> {
  if (!refreshToken) {
    return { sessionsEnded: await sessionRepository.revokeAllForUser(user.id, 'logout everywhere') };
  }
  let sid: string;
  try {
    const p = verifyRefreshToken(refreshToken);
    if (p.sub !== user.id) return { sessionsEnded: 0 };
    sid = p.sid;
  } catch {
    return { sessionsEnded: 0 }; // already expired – nothing to end
  }
  return { sessionsEnded: await sessionRepository.revoke(sid, 'logout') };
}

export async function me(user: AuthUser): Promise<UserDto> {
  const account = await accountRepository.findActiveById(user.schoolId, user.id);
  if (!account) throw unauthorized('Your account was not found. Please log in again.');
  return toUserDto(account);
}

// ---------- Logins managed by lesson-plan-service (PUT /internal/accounts) ----------

export interface AccountInput {
  id: string;
  username: string;
  name: string;
  role: Role;
  departmentId: string | null;
  active: boolean;
  password?: string;
}

// Create or update logins. A new password is hashed here – auth-service is the only place that
// ever sees or stores password material. A deactivated person is logged out on every device.
export async function syncAccounts(schoolId: string, accounts: AccountInput[]): Promise<{ created: number; updated: number; loggedOut: number }> {
  const rows = await Promise.all(
    accounts.map(async ({ password, ...a }) => ({ ...a, ...(password ? { passwordHash: await hashPassword(password) } : {}) })),
  );
  const result = await accountRepository.upsertMany(schoolId, rows);
  let loggedOut = 0;
  for (const a of accounts.filter((x) => !x.active)) {
    loggedOut += await sessionRepository.revokeAllForUser(a.id, 'account deactivated');
  }
  return { ...result, loggedOut };
}