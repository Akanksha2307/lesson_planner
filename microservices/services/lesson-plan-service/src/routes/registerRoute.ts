import { RequestHandler, Router } from "express";
import { routeConfig, RouteName } from "../config/route.config";
import authorizeRoute from "../middleware/authorize.middleware";
import validateRequest from "../middleware/validation.middleware";
import internalAuth from "../middleware/internalAuth.middleware";

// Registers one route from config/route.config.ts with the required order:
//
//   (CORS → body parser → authenticate   are applied earlier, in app.ts)
//   → role authorization → schema validation → controller
//
// Internal routes use the shared x-internal-token instead of a JWT role check.
export function registerRoute(
  router: Router,
  name: RouteName,
  controller: RequestHandler
): void {
  const definition = routeConfig[name];
  const method = definition.method.toLowerCase() as
    "get" | "post" | "put" | "patch" | "delete";

  const guard = "internal" in definition && definition.internal
    ? internalAuth
    : authorizeRoute(name);

  router[method](definition.path, guard, validateRequest(name), controller);
}
