import { Request } from "express";

// Controllers read the data that validateRequest() already checked.
// (Express 5 makes req.query read-only, so validated data lives on req.validated.)
export const validatedBody = <T = any>(req: Request): T => req.validated?.body as T;
export const validatedQuery = <T = any>(req: Request): T => req.validated?.query as T;
export const validatedParams = <T = any>(req: Request): T => req.validated?.params as T;
