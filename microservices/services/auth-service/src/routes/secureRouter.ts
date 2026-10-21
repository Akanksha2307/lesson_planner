// A Router that takes its security from config/routeRoles.ts, so nobody has to remember it.
//
//   const r = secureRouter('/api/auth');
//   r.post('/login', validate({ body: loginBody }), auth.login);
//
// For each route it looks up "POST /api/auth/login" in ROUTE_ROLES and puts the right guard first:
//   PUBLIC   → nothing
//   INTERNAL → internalOnly
//   roles()  → authenticate + requireRoles(...)
// A route that is NOT in the map makes the service refuse to start.
import { Router, type RequestHandler } from 'express';
import { ROUTE_ROLES, type HttpMethod, type RouteAccess, type RouteKey } from '../config/routeRoles.js';
import { authenticate, internalOnly, requireRoles } from '../middleware/auth.middleware.js';

const registered = new Set<string>();

function guardsFor(access: RouteAccess): RequestHandler[] {
  switch (access.kind) {
    case 'public':
      return [];
    case 'internal':
      return [internalOnly];
    case 'roles':
      return [authenticate, requireRoles(access.roles)];
  }
}

export function accessFor(key: string): RouteAccess | undefined {
  return ROUTE_ROLES[key as RouteKey];
}

type Register = (path: string, ...handlers: RequestHandler[]) => SecureRouter;
export interface SecureRouter {
  readonly router: Router;
  get: Register;
  post: Register;
  put: Register;
  patch: Register;
  delete: Register;
}

export function secureRouter(mountPath: string): SecureRouter {
  const router = Router();

  const add =
    (method: HttpMethod): Register =>
    (path, ...handlers) => {
      const key = `${method} ${mountPath}${path}`;
      const access = accessFor(key);
      if (!access) {
        throw new Error(`Route "${key}" is not in config/routeRoles.ts. Add it there with PUBLIC, INTERNAL or roles(...).`);
      }
      registered.add(key);
      const lower = method.toLowerCase() as Lowercase<HttpMethod>;
      router[lower](path, ...guardsFor(access), ...handlers);
      return api;
    };

  const api: SecureRouter = {
    router,
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),
  };
  return api;
}

// Called once after all routes are mounted: every map entry must belong to a real route
export function assertRouteMapComplete(): void {
  const unused = Object.keys(ROUTE_ROLES).filter((key) => !registered.has(key));
  if (unused.length) {
    throw new Error(`config/routeRoles.ts has entries without a route (remove or fix them):\n  - ${unused.join('\n  - ')}`);
  }
}
