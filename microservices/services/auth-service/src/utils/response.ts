// The ONE response shape every service uses (CONTRACTS.md section 4):
//   { success: true,  data: {...}, message: "OK" }
//   { success: false, data: null,  message: "...", errors?: [...] }
import type { Response } from 'express';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}
export interface ApiFailure {
  success: false;
  data: null;
  message: string;
  errors?: unknown[];
}

export const ok = <T>(res: Response, data: T, message = 'OK', status: number = HTTP_STATUS.OK): Response<ApiSuccess<T>> =>
  res.status(status).json({ success: true, data, message });

export const created = <T>(res: Response, data: T, message = 'Created'): Response<ApiSuccess<T>> =>
  ok(res, data, message, HTTP_STATUS.CREATED);

export const fail = (res: Response, status: number, message: string, errors?: unknown[]): Response<ApiFailure> =>
  res.status(status).json({ success: false, data: null, message, ...(errors?.length ? { errors } : {}) });
