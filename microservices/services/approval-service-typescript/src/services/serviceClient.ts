// @ts-nocheck
// Calls another service's /internal/... route with the shared INTERNAL_TOKEN.
// An error from that service comes back with the same status and message.
import { internalToken, services } from "../config/services.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function call(serviceName, method, path, body) {
  const url = new URL(path, services[serviceName]);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", "x-internal-token": internalToken },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw httpError(503, `The ${serviceName === "auth" ? "auth" : "lesson-plan"} service is not reachable right now. Try again in a moment.`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw httpError(res.status || 502, json.message || `${serviceName} service error`);
  }
  return json.data;
}

// auth-service: everything about the school (staff, departments with hodId, subjects, settings …)
export const getSchool = (schoolId) => call("auth", "GET", `/internal/school/${encodeURIComponent(schoolId)}`);

// lesson-plan-service: one plan (+ its lessons), and changing its status after a review
export const getPlan = (planId) => call("lessonPlan", "GET", `/internal/plans/${encodeURIComponent(planId)}`);
export const setPlanStatus = (planId, body) => call("lessonPlan", "PATCH", `/internal/plans/${encodeURIComponent(planId)}/status`, body);