import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.issues
    });
    return;
  }

  if (err?.code === 11000) {
    res.status(409).json({
      success: false,
      message: "This record already exists."
    });
    return;
  }

  const status = Number(err.status || err.statusCode);

  const statusCode =
    Number.isInteger(status) &&
    status >= 400 &&
    status < 600
      ? status
      : 500;

  if (statusCode === 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : err.message
  });
};

export default errorMiddleware;
