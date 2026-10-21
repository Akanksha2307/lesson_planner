import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index";
import { ROLES } from "../constants/roles";

// Verifies the JWT issued by the Auth service and fills req.user and req.ctx.
// Roles are NOT checked here – that is authorize.middleware.ts, which reads
// the allowed roles from config/route.config.ts.
const authenticate = (req: Request, res: Response, next: NextFunction): void => {
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
        res.status(401).json({
          success: false,
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
    req.user = {
      id: req.get("x-user-id") as string,
      role: req.get("x-user-role") as string,
      schoolId: req.get("x-school-id") || config.defaultSchoolId
    };
  } else {
    res.status(401).json({
      success: false,
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
