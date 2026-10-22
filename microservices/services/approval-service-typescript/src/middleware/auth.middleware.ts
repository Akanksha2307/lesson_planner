// @ts-nocheck
import jwt from "jsonwebtoken";

export function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required."
    });
  }

  const token = authorization.slice(7).trim();
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.startsWith("replace_with_")) {
    return res.status(500).json({
      success: false,
      message: "JWT verification is not configured."
    });
  }

  try {
    const decoded = jwt.verify(token, secret);

    const userId =
      decoded.userId ??
      decoded.id ??
      decoded.sub;

    const role = String(decoded.role ?? "").toLowerCase();

    const schoolId =
      decoded.schoolId ??
      decoded.school_id;

    if (!userId || !role) {
      return res.status(401).json({
        success: false,
        message: "Token does not contain the required user identity and role."
      });
    }

    req.user = {
      id: String(userId),
      role,
      schoolId: schoolId ? String(schoolId) : ""
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token."
    });
  }
}

export function authorizeRoles(...allowedRoles) {
  const normalizedRoles = allowedRoles.map((role) => role.toLowerCase());

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required."
      });
    }

    if (!normalizedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action."
      });
    }

    next();
  };
}
