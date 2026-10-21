import { timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/index";

// Guards /internal/... routes. Other services send the shared INTERNAL_TOKEN.
const internalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const expected = config.internalToken;
  const received = req.get("x-internal-token");

  if (!expected) {
    res.status(503).json({
      success: false,
      message: "Internal authentication is not configured"
    });
    return;
  }

  if (!received) {
    res.status(401).json({
      success: false,
      message: "Internal token required"
    });
    return;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({
      success: false,
      message: "Invalid internal token"
    });
    return;
  }

  next();
};

export default internalAuth;
