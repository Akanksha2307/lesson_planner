import type { UserDto } from './user.dto.js';

// What login, demo-login and refresh-token send back
export interface AuthResponse {
  tokenType: 'Bearer';
  accessToken: string;
  /** Same as accessToken. Kept so the current frontend (which reads "token") keeps working. */
  token: string;
  /** Seconds until the access token expires */
  expiresIn: number;
  refreshToken: string;
  user: UserDto;
}

export const buildAuthResponse = (user: UserDto, accessToken: string, refreshToken: string, expiresIn: number): AuthResponse => ({
  tokenType: 'Bearer',
  accessToken,
  token: accessToken,
  expiresIn,
  refreshToken,
  user,
});
