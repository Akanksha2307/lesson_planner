// Everything about the school (classes, staff, timetable, holidays, exams, settings …).
// The school data now lives in THIS service, so it is read straight from the database –
// no HTTP call to the auth-service any more. The name and the returned shape are the same
// as before, so planning, rescheduling and the holiday shift work exactly as they did.
import { getSchoolForServices } from "./masters.service";

export async function getSchoolData(schoolId: string): Promise<any> {
  return getSchoolForServices(schoolId);
}
