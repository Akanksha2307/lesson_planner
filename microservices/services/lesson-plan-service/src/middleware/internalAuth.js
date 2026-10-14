import { timingSafeEqual } from "node:crypto";
import { config } from "../config/index.js";

export function internalAuth(req, res, next) {
  const expected = config.internalToken;
  const received = req.get("x-internal-token");

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "Internal authentication is not configured"
    });
  }

  if (!received) {
    return res.status(401).json({
      success: false,
      message: "Internal token required"
    });
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(403).json({
      success: false,
      message: "Invalid internal token"
    });
  }

  next();
}