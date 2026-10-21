import { Response } from "express";

export const ok = (
  res: Response,
  data: unknown,
  message: string = "OK",
  status: number = 200
): Response => res.status(status).json({ success: true, data, message });

export const errorResponse = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: unknown
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
};
