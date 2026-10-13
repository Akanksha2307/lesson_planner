
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

export function authenticate(req, res, next) {
  const header = req.get("authorization") || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (token) {
    if (!config.jwtSecret) {
      return next(new Error("JWT_SECRET is not configured"));
    }

    try {
      const decoded = jwt.verify(
        token,
        config.jwtSecret,
        { algorithms: ["HS256"] }
      );

      if (
        typeof decoded !== "object" ||
        !decoded.sub ||
        !decoded.role
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid token payload"
        });
      }

      req.user = {
        id: decoded.sub,
        role: decoded.role,
        name: decoded.name,
        departmentId: decoded.departmentId,
        schoolId: decoded.schoolId
      };
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
  } else if (
    config.allowDevAuth &&
    req.get("x-user-id") &&
    ["teacher", "hod", "admin", "principal", "parent"].includes(
      req.get("x-user-role")
    )
  ) {
    req.user = {
      id: req.get("x-user-id"),
      role: req.get("x-user-role"),
      schoolId: req.get("x-school-id") || config.defaultSchoolId
    };
  } else {
    return res.status(401).json({
      success: false,
      message: "Authentication token required"
    });
  }

  req.ctx = {
    schoolId: req.user.schoolId || config.defaultSchoolId,
    academicYearId: "",
    boardId: ""
  };

  next();
}

export function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    next();
  };
}
