// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  THE ONE PLACE that says who may call which route of auth-service.           │
// │                                                                              │
// │  Key   = "METHOD /full/path"  (exactly as Express sees it, with :params)     │
// │  Value = PUBLIC            → anyone, no token                                │
// │          INTERNAL          → other services only (x-internal-token header)   │
// │          roles(...)        → logged-in users with one of these roles         │
// │                                                                              │
// │  Rules (checked when the service starts – it refuses to start otherwise):    │
// │   • every route that is registered MUST be in this map  → no forgotten route │
// │   • every entry in this map MUST belong to a real route → no stale entries   │
// └──────────────────────────────────────────────────────────────────────────────┘
import { ALL_ROLES, type Role } from '../constants/roles.js';

export type RouteAccess =
  | { readonly kind: 'public' }
  | { readonly kind: 'internal' }
  | { readonly kind: 'roles'; readonly roles: readonly Role[] };

export const PUBLIC: RouteAccess = { kind: 'public' };
export const INTERNAL: RouteAccess = { kind: 'internal' };
export const roles = (...list: readonly Role[]): RouteAccess => ({ kind: 'roles', roles: list });

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RouteKey = `${HttpMethod} /${string}`;

export const ROUTE_ROLES: Readonly<Record<RouteKey, RouteAccess>> = {
  // ── /api/auth ────────────────────────────────────────────────────────────────
  'POST /api/auth/login':                         PUBLIC,
  'POST /api/auth/refresh-token':                 PUBLIC, // the refresh token itself is the proof
  'POST /api/auth/demo-login':                    PUBLIC, // turned off unless ALLOW_DEV_AUTH=true
  'POST /api/auth/logout':                        roles(...ALL_ROLES),
  'GET /api/auth/me':                             roles(...ALL_ROLES),

  // ── /internal – service to service (the gateway blocks these from outside) ───
  'PUT /internal/accounts':                       INTERNAL, // lesson-plan-service creates / updates logins
};