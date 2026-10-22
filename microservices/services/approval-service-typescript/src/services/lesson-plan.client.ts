// @ts-nocheck
const BASE_URL = (
  process.env.LESSON_PLAN_SERVICE_URL || "http://localhost:5002"
).replace(/\/+$/, "");

async function request(path, options = {}) {
  const token = process.env.INTERNAL_TOKEN;

  if (!token) {
    throw new Error("INTERNAL_TOKEN is not configured.");
  }

  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "x-internal-token": token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error("Could not connect to the Lesson Plan Service.");
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Lesson Plan Service request failed."
    );
    error.status = response.status || 502;
    throw error;
  }

  return result.data;
}

export async function getLessonPlan(planId) {
  return request(
    `/internal/plans/${encodeURIComponent(planId)}`
  );
}

export async function updateLessonPlanStatus(
  planId,
  { status, reviewerId, comment = "", schoolId }
) {
  return request(
    `/internal/plans/${encodeURIComponent(planId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status,
        reviewerId,
        comment,
        schoolId
      })
    }
  );
}
