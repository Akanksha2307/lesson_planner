export const ROLES = {
  TEACHER: "teacher",
  HOD: "hod",
  PRINCIPAL: "principal",
  ADMIN: "admin"
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
