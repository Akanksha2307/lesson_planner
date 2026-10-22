// @ts-nocheck
// Only other services may call /internal/... – they send the shared INTERNAL_TOKEN
// in the x-internal-token header. (The gateway blocks /internal from the outside.)
import { timingSafeEqual } from "node:crypto";
import { internalToken } from "../config/services.js";

export function internalOnly(req, res, next) {
  const sent = Buffer.from(String(req.get("x-internal-token") || ""));
  const expected = Buffer.from(internalToken);

  if (!internalToken || sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    return res.status(401).json({ success: false, data: null, message: "Internal token is missing or wrong." });
  }
  next();
}