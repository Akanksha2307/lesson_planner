
import { ZodError } from "zod";

export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.issues
    });
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

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : err.message
  });
}
