
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index";
import { ROLES } from "../constants/roles";

// Verify access tokens issued by the Auth service.
// Role-based permissions are checked separately
// by authorize.middleware.ts.

const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const header = req.get("authorization") || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (token) {
    if (!config.jwtSecret) {
      next(new Error("JWT_SECRET is not configured"));
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: "qshikshak-auth",
        audience: "qshikshak"
      });

      if (
        typeof decoded !== "object" ||
        decoded.type !== "access" ||
        !decoded.sub ||
        !decoded.role ||
        !decoded.schoolId
      ) {
        res.status(401).json({
          success: false,
          data: null,
          message: "Invalid token payload"
        });
        return;
      }

      req.user = {
        id: decoded.sub,
        role: decoded.role,
        name: decoded.name,
        departmentId: decoded.departmentId,
        schoolId: decoded.schoolId
      };
    } catch {
      res.status(401).json({
        success: false,
        data: null,
        message: "Invalid or expired token"
      });
      return;
    }
  } else if (
    config.allowDevAuth &&
    req.get("x-user-id") &&
    (Object.values(ROLES) as string[]).includes(
      req.get("x-user-role") as string
    )
  ) {
    // Development authentication is permitted only
    // when ALLOW_DEV_AUTH is explicitly enabled.
    req.user = {
      id: req.get("x-user-id") as string,
      role: req.get("x-user-role") as string,
      schoolId:
        req.get("x-school-id") || config.defaultSchoolId
    };
  } else {
    res.status(401).json({
      success: false,
      data: null,
      message: "Authentication token required"
    });
    return;
  }

  req.ctx = {
    schoolId: req.user.schoolId || config.defaultSchoolId,
    academicYearId: "",
    boardId: ""
  };

  next();
};

export default authenticate;
