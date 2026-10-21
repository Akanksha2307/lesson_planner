// Everyone who can log in. Same list in every service (CONTRACTS.md section 4).
export const ROLES = ['teacher', 'hod', 'principal', 'admin', 'parent'] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

// For the route → roles map: "any logged-in user"
export const ALL_ROLES: readonly Role[] = ROLES;