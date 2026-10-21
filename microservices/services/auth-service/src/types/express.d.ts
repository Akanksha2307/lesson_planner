// Adds our own fields to Express' Request, so controllers get real types (no "req as any").
import type { AuthUser } from './auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by authenticate() – the logged-in user */
      user?: AuthUser;
      /** Set by validate() – the parsed and cleaned body, query and params */
      validated?: { body?: unknown; query?: unknown; params?: unknown };
      /** Set by requestId() – also sent back as the x-request-id header */
      id?: string;
    }
  }
}

export {};