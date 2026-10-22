// Who may review a plan (CONTRACTS.md section 8):
//   - the HOD of the subject's department reviews;
//   - the principal may review ONLY when the HOD is not available:
//       the department has no HOD, the HOD's account is inactive,
//       or the plan has waited settings.principalAfterDays (default 2) or more.
//   - if settings.approver = "principal", the principal always reviews.
import type { AuthUser } from '../types/auth.types.js';
import type { Plan, School } from '../types/school.types.js';

const DAY = 24 * 60 * 60 * 1000;

const byId = <T extends { id: string }>(list: T[] = []) => new Map(list.map((x) => [x.id, x]));

export interface HodStatus {
  hodId: string | null;
  hodName?: string;
  available: boolean;
  reason: string | null;
  waitingDays: number;
  limit: number;
}

export function hodStatus(school: School, plan: Pick<Plan, 'subjectId' | 'submittedAt'>): HodStatus {
  const departmentId = byId(school.subjects).get(plan.subjectId)?.departmentId;
  const hodId = departmentId ? byId(school.departments).get(departmentId)?.hodId : undefined;
  const hod = hodId ? byId(school.staff).get(hodId) : undefined;
  const waitingDays = plan.submittedAt ? Math.floor((Date.now() - new Date(plan.submittedAt).getTime()) / DAY) : 0;
  const limit = school.settings?.principalAfterDays ?? 2;

  let reason: string | null = null;
  if (!hod) reason = 'no HOD is assigned to this department';
  else if (hod.active === false) reason = `the HOD (${hod.name}) is inactive`;
  else if (waitingDays >= limit) reason = `the plan has waited ${waitingDays} day${waitingDays === 1 ? '' : 's'} for the HOD`;

  return { hodId: hod?.id ?? null, hodName: hod?.name, available: !reason, reason, waitingDays, limit };
}

// null = this user may review; otherwise the reason why not
export function whyCannotReview(school: School, user: Pick<AuthUser, 'id' | 'role'>, plan: Pick<Plan, 'subjectId' | 'submittedAt'>): string | null {
  if (school.settings?.approver === 'principal') {
    return user.role === 'principal' ? null : 'In this school only the principal reviews plans.';
  }
  const hod = hodStatus(school, plan);
  if (user.role === 'hod') {
    return hod.hodId === user.id ? null : 'Only the HOD of this subject or the principal can review this plan.';
  }
  if (user.role === 'principal') {
    if (!hod.available) return null;
    const left = hod.limit - hod.waitingDays;
    return `${hod.hodName} (HOD) reviews this plan. You can step in if the HOD is unavailable, or if it is still waiting in ${left} day${left === 1 ? '' : 's'}.`;
  }
  return 'Only an HOD or the principal can review a lesson plan.';
}
