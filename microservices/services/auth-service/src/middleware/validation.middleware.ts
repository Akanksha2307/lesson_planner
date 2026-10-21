// Request validation with zod. Checks params, query and body BEFORE the controller runs.
//
//   router.get('/plans/:id', validate({ params: idParams, query: listQuery }), controller)
//   router.post('/login',    validate({ body: loginBody }), controller)
//
// The cleaned values (trimmed, defaults filled in, unknown fields removed) are put on
// req.validated. Read them in the controller with bodyOf / queryOf / paramsOf.
// Note: in Express 5 req.query is read-only, which is why we never write to it.
import type { NextFunction, Request, Response } from 'express';
import type { z, ZodType } from 'zod';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

export interface RequestSchemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

type Part = keyof RequestSchemas;
const PARTS: Part[] = ['params', 'query', 'body'];

export interface ValidationIssue {
  location: Part;
  field: string;
  message: string;
}

export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ValidationIssue[] = [];
    const out: NonNullable<Request['validated']> = { ...req.validated };

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        out[part] = result.data;
      } else {
        for (const i of result.error.issues) {
          issues.push({ location: part, field: i.path.join('.'), message: i.message });
        }
      }
    }

    if (issues.length) {
      const first = issues[0]!;
      const label = first.field || first.location;
      return next(new AppError(`${label}: ${first.message}`, HTTP_STATUS.BAD_REQUEST, issues));
    }
    req.validated = out;
    next();
  };

function read<S extends ZodType>(req: Request, part: Part): z.output<S> {
  if (!req.validated || !(part in req.validated)) {
    throw new Error(`validate({ ${part} }) is missing on route ${req.method} ${req.baseUrl}${req.route?.path ?? ''}`);
  }
  return req.validated[part] as z.output<S>;
}

// Typed readers: const body = bodyOf<typeof loginBody>(req)
export const bodyOf = <S extends ZodType>(req: Request) => read<S>(req, 'body');
export const queryOf = <S extends ZodType>(req: Request) => read<S>(req, 'query');
export const paramsOf = <S extends ZodType>(req: Request) => read<S>(req, 'params');
