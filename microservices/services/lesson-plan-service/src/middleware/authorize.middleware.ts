import { Request, Response, NextFunction, RequestHandler } from "express";
import { routeConfig, RouteName, RouteDefinition } from "../config/route.config";

// Role-based authorization driven by config/route.config.ts.
//
//   401 – nobody is logged in (authenticate did not set req.user)
//   403 – logged in, but the role is not in the route's `roles` list
//   next() – allowed
//
// A route with no `roles` list is open to every logged-in user.
// Run it AFTER authenticate.middleware.ts.
export const authorizeRoute = (name: RouteName): RequestHandler => {
  const definition: RouteDefinition = routeConfig[name];
  const roles = definition.roles;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    if (roles && !(roles as readonly string[]).includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Access denied"
      });
      return;
    }

    next();
  };
};

export default authorizeRoute;
