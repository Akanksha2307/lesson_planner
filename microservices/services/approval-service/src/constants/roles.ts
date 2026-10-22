// Everyone who can log in. Same list in every service (CONTRACTS.md section 4).
export const ROLES = ['teacher', 'hod', 'principal', 'admin', 'parent'] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

// Groups for config/route.config.ts
export const ALL_ROLES: readonly Role[] = ROLES;
export const STAFF: readonly Role[] = ['teacher', 'hod', 'principal', 'admin'];
export const REVIEWERS: readonly Role[] = ['hod', 'principal'];
