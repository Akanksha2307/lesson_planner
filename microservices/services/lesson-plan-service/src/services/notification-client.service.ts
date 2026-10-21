// Calls the approval-service /internal/notify route (bell notifications).
// These calls never break a save: if approval-service is down, the holiday/exam is still
// saved and we just log it.
import { config } from "../config/index";

async function call(baseUrl: string, name: string, path: string, body: unknown, timeoutMs = 10000) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": config.internalToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[lesson-plan-service] ${name} ${path} answered ${res.status}: ${json.message || ""}`);
      return null;
    }
    return json.data ?? true;
  } catch (err: any) {
    console.warn(`[lesson-plan-service] ${name} is not reachable (${path}): ${err.message}`);
    return null;
  }
}

// approval-service: bell notification for these people
export const notify = (schoolId: string, to: string[], title: string, text: string, link: string) =>
  to.length
    ? call(config.approvalUrl, "approval-service", "/internal/notify", { schoolId, to, title, text, link })
    : null;
