// The ONE response shape every service uses (CONTRACTS.md section 4):
//   { success: true,  data: {...}, message: "OK" }
//   { success: false, data: null,  message: "...", errors?: [...] }
import type { Response } from 'express';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export const ok = <T>(res: Response, data: T, message = 'OK', status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data, message });
};

export const fail = (res: Response, status: number, message: string, errors?: unknown[]): void => {
  res.status(status).json({ success: false, data: null, message, ...(errors?.length ? { errors } : {}) });
};
