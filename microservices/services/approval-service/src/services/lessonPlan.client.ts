// Calls to lesson-plan-service's /internal routes (shared INTERNAL_TOKEN).
// lesson-plan-service owns the plans AND the school data (staff, departments with hodId, settings …).
// An error answer from it comes back with the same status and message.
import { config } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import type { Plan, School } from '../types/school.types.js';
import { AppError } from '../utils/AppError.js';

async function call<T>(method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(new URL(path, config.lessonPlanUrl), {
      method,
      headers: { 'content-type': 'application/json', 'x-internal-token': config.internalToken },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError('The lesson-plan service is not reachable right now. Try again in a moment.', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; message?: string };
  if (!res.ok || json.success === false) {
    throw new AppError(json.message || 'lesson-plan service error', res.status || HTTP_STATUS.BAD_GATEWAY);
  }
  return json.data as T;
}

const enc = encodeURIComponent;

// Everything about the school: staff, departments (with hodId), subjects, sections, settings …
export const getSchool = (schoolId: string) => call<School>('GET', `/internal/school/${enc(schoolId)}`);

// One plan (+ its lessons)
export const getPlan = (planId: string) => call<{ plan: Plan; items: unknown[] }>('GET', `/internal/plans/${enc(planId)}`);

// Change the plan's status after a review. lesson-plan-service only does it while the plan is
// still "submitted" (atomic), so if the HOD and the principal click together, the first one wins (409).
export const setPlanStatus = (
  planId: string,
  body: { schoolId: string; status: 'approved' | 'returned'; reviewerId: string; comment: string },
) => call<Plan>('PATCH', `/internal/plans/${enc(planId)}/status`, body);
