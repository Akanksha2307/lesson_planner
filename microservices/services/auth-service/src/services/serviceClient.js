// Calls to other services' /internal routes. These calls never break a save:
// if the other service is down, the holiday/exam is still saved and we just log it.
import { config } from '../config/index.js';

async function call(baseUrl, name, path, body) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': config.internalToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[${config.serviceName}] ${name} ${path} answered ${res.status}: ${json.message || ''}`);
      return null;
    }
    return json.data ?? true;
  } catch (err) {
    console.warn(`[${config.serviceName}] ${name} is not reachable (${path}): ${err.message}`);
    return null;
  }
}

// lesson-plan-service: move the lessons planned on a sudden holiday → { affectedCount, movedCount, teacherIds }
export const shiftLessonsForHoliday = (schoolId, date) =>
  call(config.lessonPlanUrl, 'lesson-plan-service', '/internal/holiday-shift', { schoolId, date });

// approval-service: bell notification for these people
export const notify = (schoolId, to, title, text, link) =>
  to.length ? call(config.approvalUrl, 'approval-service', '/internal/notify', { schoolId, to, title, text, link }) : null;