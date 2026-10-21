import "express-serve-static-core";
import { AuthUser, RequestContext, ValidatedData } from "./index";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
    ctx?: RequestContext;
    validated?: ValidatedData;
  }
}
export {};
