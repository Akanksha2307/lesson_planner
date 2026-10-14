import { config } from "../config/index.js";

export async function getSchoolData(schoolId) {
  const response = await fetch(
    `${config.authServiceUrl.replace(/\/$/, "")}/internal/school/${encodeURIComponent(schoolId)}`,
    {
      headers: {
        "x-internal-token": config.internalToken
      },
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) {
    throw new Error(`Auth Service returned HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.success || !result.data) {
    throw new Error("Invalid response from Auth Service");
  }

  return result.data;
}