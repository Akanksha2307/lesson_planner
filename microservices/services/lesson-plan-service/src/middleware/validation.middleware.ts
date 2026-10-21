import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodType } from "zod";
import { routeConfig, RouteName, RouteDefinition } from "../config/route.config";
import { ValidatedData } from "../types";

type Part = "params" | "query" | "body";

// Reusable Zod validation driven by config/route.config.ts.
//
//   params → paramsSchema   (dynamic routes: /plans/:id)
//   query  → querySchema    (GET filters, dates, search …)
//   body   → bodySchema     (POST / PUT / PATCH)
//
// safeParse() is used, so bad input never throws. On failure it answers 400:
//   { success:false, message:"Validation failed", errors:[{ location, field, message, code, path }] }
// On success the parsed data (defaults applied, types coerced) is stored in
// req.validated for the controller. Express 5 makes req.query read-only, so
// req.query itself is left alone.
export const validateRequest = (name: RouteName): RequestHandler => {
  const definition: RouteDefinition = routeConfig[name];

  const checks: Array<[Part, ZodType | undefined]> = [
    ["params", definition.paramsSchema],
    ["query", definition.querySchema],
    ["body", definition.bodySchema]
  ];

  return (req: Request, res: Response, next: NextFunction): void => {
    const validated: ValidatedData = {};
    const errors: unknown[] = [];

    for (const [part, schema] of checks) {
      if (!schema) continue;

      const result = schema.safeParse(req[part]);

      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          errors.push({
            ...issue,
            location: part,
            field: issue.path.join(".")
          });
        }
      }
    }

    if (errors.length) {
      const first: any = errors[0];
      const message =
        definition.validationMessage ??
        (definition.messageFromFirstIssue
          ? `${first.field || "Request"}: ${first.message}`
          : "Validation failed");

      res.status(400).json({
        success: false,
        message,
        errors
      });
      return;
    }

    req.validated = validated;
    next();
  };
};

export default validateRequest;
